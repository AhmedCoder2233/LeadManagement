'use client';

import { createClient } from '@supabase/supabase-js';
import { useEffect, useState, useCallback } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import Image from 'next/image';
import * as XLSX from 'xlsx';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  }
);

interface Lead {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  company?: string;
  job_title?: string;
  location?: string;
  source?: string;
  status: 'new' | 'open' | 'important';
  is_active: boolean;
  industry?: string;
  created_at: string;
  updated_at?: string;
  user_id: string;
}

interface FollowUp {
  id: string;
  lead_id: string;
  follow_up_date: string;
  remarks?: string;
  completed: boolean;
  created_at: string;
  completed_at?: string;
  leads?: { 
    full_name: string; 
    email: string;
    is_active?: boolean;
    status?: string;
  };
  user_id: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  due_date: string;
  completed: boolean;
  created_at: string;
  user_id: string;
}

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
}

export default function LeadManagement() {
  const [activeTab, setActiveTab] = useState('all-leads');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [allFollowUps, setAllFollowUps] = useState<FollowUp[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isFollowUpHistoryModalOpen, setIsFollowUpHistoryModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [followUpHistory, setFollowUpHistory] = useState<FollowUp[]>([]);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [sortBy, setSortBy] = useState('newest');
  const [toast, setToast] = useState<Toast | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [followUpFilter, setFollowUpFilter] = useState<'all' | 'today'>('all');
  const [taskFilter, setTaskFilter] = useState<'all' | 'today'>('all');
  const [selectedLeadForFollowUp, setSelectedLeadForFollowUp] = useState<string>('');

  const [leadForm, setLeadForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    company: '',
    job_title: '',
    location: '',
    source: 'Website',
    status: 'new' as 'new' | 'open' | 'important',
    industry: ''
  });

  const [followUpForm, setFollowUpForm] = useState({
    lead_id: '',
    follow_up_date: '',
    remarks: '',
    set_active: true
  });

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    due_date: ''
  });

  const fetchAllData = useCallback(async () => {
    if (!user) return;
    
    await fetchLeads();
    await fetchAllFollowUps();
    await fetchTasks();
  }, [user]);

  useEffect(() => {
    initializeAuth();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (user) {
      fetchAllData();
      setupRealtimeSubscriptions();
    }
  }, [user, fetchAllData]);

  const initializeAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        await handleUserSession(session.user);
      }
      
      const { data: authListener } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (session?.user) {
            await handleUserSession(session.user);
          } else {
            setUser(null);
            setLeads([]);
            setFollowUps([]);
            setAllFollowUps([]);
            setTasks([]);
          }
          setLoading(false);
        }
      );

      setLoading(false);
      return () => {
        authListener.subscription.unsubscribe();
      };
    } catch (error) {
      console.error('Auth initialization error:', error);
      setLoading(false);
    }
  };

  const handleUserSession = async (authUser: any) => {
    try {
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();
      
      if (userError && userError.code === 'PGRST116') {
        const { data: newProfile } = await supabase
          .from('profiles')
          .insert([
            {
              id: authUser.id,
              full_name: authUser.user_metadata.full_name || authUser.email?.split('@')[0],
              avatar_url: authUser.user_metadata.avatar_url
            }
          ])
          .select()
          .single();
        
        setUser({
          id: authUser.id,
          email: authUser.email!,
          full_name: newProfile?.full_name || authUser.email?.split('@')[0],
          avatar_url: newProfile?.avatar_url
        });
      } else {
        setUser({
          id: authUser.id,
          email: authUser.email!,
          full_name: userData?.full_name || authUser.user_metadata.full_name || authUser.email?.split('@')[0],
          avatar_url: userData?.avatar_url || authUser.user_metadata.avatar_url
        });
      }
    } catch (error) {
      console.error('Handle user session error:', error);
    }
  };

  const setupRealtimeSubscriptions = () => {
    if (!user) return;

    const leadsChannel = supabase
      .channel('leads-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Lead change detected:', payload);
          fetchAllData();
        }
      )
      .subscribe();

    const followUpsChannel = supabase
      .channel('followups-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'follow_ups',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Follow-up change detected:', payload);
          fetchAllData();
        }
      )
      .subscribe();

    const tasksChannel = supabase
      .channel('tasks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Task change detected:', payload);
          fetchAllData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(followUpsChannel);
      supabase.removeChannel(tasksChannel);
    };
  };

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });
    
    if (error) {
      showToast('Failed to sign in with Google', 'error');
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      showToast('Failed to sign out', 'error');
    } else {
      showToast('Signed out successfully', 'success');
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const fetchLeads = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Fetch leads error:', error);
        showToast('Failed to fetch leads', 'error');
        return;
      }
      
      if (data) {
        const formattedData = data.map(lead => ({
          ...lead,
          is_active: lead.is_active === true
        }));
        setLeads(formattedData);
      } else {
        setLeads([]);
      }
      
    } catch (error) {
      console.error('Fetch leads exception:', error);
      showToast('Error fetching leads', 'error');
    }
  };

  const fetchAllFollowUps = async () => {
    if (!user) return;

    try {
    const { data: followUpsData, error: followUpsError } = await supabase
      .from('follow_ups')
      .select('*, leads(full_name, email, is_active, status)')
      .eq('user_id', user.id)
      .order('follow_up_date', { ascending: true });


      if (followUpsError) {
        console.error('Follow-ups fetch error:', followUpsError);
        return;
      }

      if (followUpsData) {
        setAllFollowUps(followUpsData);
        
        // Filter based on selected filter
        let filteredFollowUps = followUpsData.filter(f => !f.completed);
        
        if (followUpFilter === 'today') {
          const today = new Date().toISOString().split('T')[0];
          filteredFollowUps = filteredFollowUps.filter(f => f.follow_up_date === today);
        }
        
        // Only show follow-ups for active leads
        filteredFollowUps = filteredFollowUps.filter(f => f.leads?.is_active !== false);
        
        setFollowUps(filteredFollowUps);
      }
    } catch (error) {
      console.error('Fetch follow-ups error:', error);
      showToast('Error fetching follow-ups', 'error');
    }
  };

  const fetchTasks = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('due_date', { ascending: false });
      
      if (!error && data) setTasks(data);
    } catch (error) {
      console.error('Fetch tasks error:', error);
    }
  };

  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const formatStatusDisplay = (status: string): string => {
    switch (status) {
      case 'new': return 'New';
      case 'open': return 'Open';
      case 'important': return 'Important';
      default: return status;
    }
  };

  const addOrUpdateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      showToast('Please sign in to add leads', 'error');
      return;
    }
    
    if (editingItem) {
      const { error } = await supabase
        .from('leads')
        .update({ 
          full_name: leadForm.full_name,
          email: leadForm.email,
          phone: leadForm.phone,
          company: leadForm.company,
          job_title: leadForm.job_title,
          location: leadForm.location,
          source: leadForm.source,
          status: leadForm.status,
          industry: leadForm.industry,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingItem.id)
        .eq('user_id', user.id);
      
      if (!error) {
        showToast('Lead updated successfully!', 'success');
        resetLeadForm();
        fetchAllData();
      } else {
        console.error('Update lead error:', error);
        showToast(`Failed to update lead: ${error.message}`, 'error');
      }
    } else {
      const leadData = {
        full_name: leadForm.full_name,
        email: leadForm.email,
        phone: leadForm.phone,
        company: leadForm.company,
        job_title: leadForm.job_title,
        location: leadForm.location,
        source: leadForm.source,
        status: leadForm.status,
        is_active: true,
        industry: leadForm.industry,
        user_id: user.id,
        created_at: new Date().toISOString()
      };
      
      const { data, error } = await supabase
        .from('leads')
        .insert([leadData])
        .select();
      
      if (!error) {
        resetLeadForm();
        showToast('Lead added successfully!', 'success');
        fetchAllData();
      } else {
        console.error('Insert lead error:', error);
        showToast(`Failed to add lead: ${error.message}`, 'error');
      }
    }
  };

  const addOrUpdateFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      showToast('Please sign in to add follow-ups', 'error');
      return;
    }
    
    const today = new Date(getTodayDate());
    const selectedDate = new Date(followUpForm.follow_up_date);
    
    if (selectedDate < today) {
      showToast('Follow-up date cannot be in the past!', 'error');
      return;
    }
    
    // First, check if there's an existing follow-up for this lead
    const { data: existingFollowUps } = await supabase
      .from('follow_ups')
      .select('*')
      .eq('lead_id', followUpForm.lead_id)
      .eq('completed', false)
      .eq('user_id', user.id);
    
    try {
      // Mark existing follow-ups as completed
      if (existingFollowUps && existingFollowUps.length > 0) {
        for (const existingFollowUp of existingFollowUps) {
          await supabase
            .from('follow_ups')
            .update({ 
              completed: true, 
              completed_at: new Date().toISOString()
            })
            .eq('id', existingFollowUp.id)
            .eq('user_id', user.id);
        }
      }
      
      // Update lead active status
      await supabase
        .from('leads')
        .update({ 
          is_active: followUpForm.set_active
        })
        .eq('id', followUpForm.lead_id)
        .eq('user_id', user.id);
      
      // Add new follow-up
      const { error } = await supabase.from('follow_ups').insert([{
        lead_id: followUpForm.lead_id,
        follow_up_date: followUpForm.follow_up_date,
        remarks: followUpForm.remarks,
        user_id: user.id,
        created_at: new Date().toISOString(),
        completed: false
      }]);
      
      if (!error) {
        resetFollowUpForm();
        showToast('Follow-up scheduled successfully!', 'success');
        fetchAllData();
      } else {
        showToast('Failed to schedule follow-up', 'error');
      }
    } catch (error) {
      showToast('Failed to schedule follow-up', 'error');
    }
  };

  const addOrUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      showToast('Please sign in to add tasks', 'error');
      return;
    }
    
    if (new Date(taskForm.due_date) < new Date(getTodayDate())) {
      showToast('Task due date cannot be in the past!', 'error');
      return;
    }
    
    if (editingItem) {
      const { error } = await supabase
        .from('tasks')
        .update({ ...taskForm, updated_at: new Date().toISOString() })
        .eq('id', editingItem.id)
        .eq('user_id', user.id);
      if (!error) {
        resetTaskForm();
        showToast('Task updated successfully!', 'success');
        fetchAllData();
      } else {
        showToast('Failed to update task', 'error');
      }
    } else {
      const { error } = await supabase.from('tasks').insert([{
        ...taskForm,
        user_id: user.id,
        created_at: new Date().toISOString(),
        completed: false
      }]);
      if (!error) {
        resetTaskForm();
        showToast('Task created successfully!', 'success');
        fetchAllData();
      } else {
        showToast('Failed to create task', 'error');
      }
    }
  };

  const updateLeadStatus = async (lead: Lead, newStatus: string) => {
    if (!user) return;
    
    const { error } = await supabase
      .from('leads')
      .update({ 
        status: newStatus.toLowerCase(),
        updated_at: new Date().toISOString() 
      })
      .eq('id', lead.id)
      .eq('user_id', user.id);
    
    if (!error) {
      showToast(`Lead status changed to ${formatStatusDisplay(newStatus.toLowerCase())}`, 'success');
      fetchAllData();
    } else {
      showToast(`Failed to update lead status: ${error.message}`, 'error');
    }
  };

  const updateLeadActiveStatus = async (lead: Lead, isActive: boolean) => {
    if (!user) return;
    
    const { error } = await supabase
      .from('leads')
      .update({ 
        is_active: isActive,
        updated_at: new Date().toISOString() 
      })
      .eq('id', lead.id)
      .eq('user_id', user.id);
    
    if (!error) {
      showToast(`Lead ${isActive ? 'activated' : 'deactivated'} successfully!`, 'success');
      fetchAllData();
    } else {
      showToast(`Failed to update lead active status: ${error.message}`, 'error');
    }
  };

  const toggleTaskComplete = async (task: Task) => {
    if (!user) return;
    
    const { error } = await supabase
      .from('tasks')
      .update({ completed: !task.completed })
      .eq('id', task.id)
      .eq('user_id', user.id);
    if (!error) {
      showToast(task.completed ? 'Task marked as incomplete' : 'Task completed!', 'success');
      fetchAllData();
    } else {
      showToast('Failed to update task', 'error');
    }
  };

  const completeFollowUp = async (followUp: FollowUp) => {
    if (!user) return;
    
    const { error } = await supabase
      .from('follow_ups')
      .update({ 
        completed: true, 
        completed_at: new Date().toISOString()
      })
      .eq('id', followUp.id)
      .eq('user_id', user.id);
    
    if (!error) {
      showToast('Follow-up marked as completed!', 'success');
      fetchAllData();
    } else {
      console.error('Complete follow-up error:', error);
      showToast('Failed to complete follow-up', 'error');
    }
  };

  const viewFollowUpHistory = async (lead: Lead) => {
    if (!user) return;
    
    setSelectedLead(lead);
    const { data, error } = await supabase
      .from('follow_ups')
      .select('*, leads(full_name, email)')
      .eq('lead_id', lead.id)
      .eq('user_id', user.id)
      .order('follow_up_date', { ascending: false });
    if (!error && data) {
      setFollowUpHistory(data);
      setIsHistoryModalOpen(true);
    }
  };

  const viewFollowUpHistoryForLead = async (leadId: string) => {
    if (!user) return;
    
    const { data: leadData, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .single();
    
    if (leadError || !leadData) return;
    
    setSelectedLead(leadData);
    const { data, error } = await supabase
      .from('follow_ups')
      .select('*, leads(full_name, email)')
      .eq('lead_id', leadId)
      .eq('user_id', user.id)
      .order('follow_up_date', { ascending: false });
    if (!error && data) {
      setFollowUpHistory(data);
      setIsHistoryModalOpen(true);
    }
  };

  const viewAllFollowUpHistory = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('follow_ups')
      .select('*, leads(full_name, email)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (!error && data) {
      setFollowUpHistory(data);
      setIsFollowUpHistoryModalOpen(true);
    }
  };

  const saveHistoryAsPDF = async () => {
    if (!selectedLead && followUpHistory.length === 0) return;

    const element = document.createElement('div');
    element.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto;">
        <h1 style="color: #1f2937; border-bottom: 3px solid #000; padding-bottom: 10px;">
          ${selectedLead ? `Follow-up History - ${selectedLead.full_name}` : 'All Follow-up History'}
        </h1>
        <div style="margin: 20px 0; color: #4b5563;">
          ${selectedLead ? `
            <strong>Lead Name:</strong> ${selectedLead.full_name}<br>
            <strong>Email:</strong> ${selectedLead.email}<br>
            <strong>Company:</strong> ${selectedLead.company || 'N/A'}<br>
            <strong>Phone:</strong> ${selectedLead.phone || 'N/A'}<br>
            <strong>Status:</strong> ${formatStatusDisplay(selectedLead.status)}<br>
            <strong>Active Status:</strong> ${selectedLead.is_active ? 'Active' : 'Inactive'}<br>
          ` : ''}
          <strong>Report Generated:</strong> ${new Date().toLocaleString()}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <thead>
            <tr style="background-color: #000; color: white;">
              <th style="padding: 12px; text-align: left;">Lead Name</th>
              <th style="padding: 12px; text-align: left;">Date Added</th>
              <th style="padding: 12px; text-align: left;">Follow-up Date</th>
              <th style="padding: 12px; text-align: left;">Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${followUpHistory.map(h => `
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px;">${h.leads?.full_name || 'N/A'}</td>
                <td style="padding: 10px;">${new Date(h.created_at).toLocaleDateString()}</td>
                <td style="padding: 10px;">${new Date(h.follow_up_date).toLocaleDateString()}</td>
                <td style="padding: 10px;">${h.remarks || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.body.appendChild(element);

    try {
      const canvas = await html2canvas(element);
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const fileName = selectedLead 
        ? `FollowUpHistory_${selectedLead.full_name}_${new Date().toISOString().split('T')[0]}.pdf`
        : `AllFollowUps_${new Date().toISOString().split('T')[0]}.pdf`;
      
      pdf.save(fileName);
      showToast('PDF saved successfully!', 'success');
    } catch (error) {
      showToast('Failed to save PDF', 'error');
    } finally {
      document.body.removeChild(element);
    }
  };

  const resetLeadForm = () => {
    setLeadForm({
      full_name: '',
      email: '',
      phone: '',
      company: '',
      job_title: '',
      location: '',
      source: 'Website',
      status: 'new',
      industry: ''
    });
    setEditingItem(null);
    setIsLeadModalOpen(false);
  };

  const resetFollowUpForm = () => {
    setFollowUpForm({
      lead_id: '',
      follow_up_date: '',
      remarks: '',
      set_active: true
    });
    setSelectedLeadForFollowUp('');
    setEditingItem(null);
    setIsFollowUpModalOpen(false);
  };

  const resetTaskForm = () => {
    setTaskForm({
      title: '',
      description: '',
      due_date: ''
    });
    setEditingItem(null);
    setIsTaskModalOpen(false);
  };

  const editLead = (lead: Lead) => {
    setEditingItem(lead);
    setLeadForm({
      full_name: lead.full_name,
      email: lead.email,
      phone: lead.phone || '',
      company: lead.company || '',
      job_title: lead.job_title || '',
      location: lead.location || '',
      source: lead.source || 'Website',
      status: lead.status,
      industry: lead.industry || ''
    });
    setIsLeadModalOpen(true);
  };

  const editFollowUp = (followUp: FollowUp) => {
    setEditingItem(followUp);
    setFollowUpForm({
      lead_id: followUp.lead_id,
      follow_up_date: followUp.follow_up_date,
      remarks: followUp.remarks || '',
      set_active: true
    });
    setIsFollowUpModalOpen(true);
  };

  const editTask = (task: Task) => {
    setEditingItem(task);
    setTaskForm({
      title: task.title,
      description: task.description || '',
      due_date: task.due_date
    });
    setIsTaskModalOpen(true);
  };

  const getFilteredAndSortedLeads = () => {
    let filtered = leads.filter((lead) => {
      const matchesSearch =
        lead.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (lead.company && lead.company.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesSource = sourceFilter === 'All' || lead.source === sourceFilter;
      return matchesSearch && matchesSource;
    });

    switch (sortBy) {
      case 'newest':
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'oldest':
        filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case 'name':
        filtered.sort((a, b) => a.full_name.localeCompare(b.full_name));
        break;
      case 'company':
        filtered.sort((a, b) => (a.company || '').localeCompare(b.company || ''));
        break;
    }

    return filtered;
  };

  const getFilteredTasks = () => {
    if (taskFilter === 'today') {
      const today = new Date().toISOString().split('T')[0];
      return tasks.filter(task => task.due_date === today);
    }
    return tasks;
  };

  const exportToCSV = () => {
    const headers = ['Full Name', 'Email', 'Phone', 'Company', 'Job Title', 'Location', 'Source', 'Status', 'Is Active', 'Industry', 'Created At'];
    const csvData = leads.map((lead) => [
      lead.full_name,
      lead.email,
      lead.phone || '',
      lead.company || '',
      lead.job_title || '',
      lead.location || '',
      lead.source || '',
      formatStatusDisplay(lead.status),
      lead.is_active ? 'Active' : 'Inactive',
      lead.industry || '',
      new Date(lead.created_at).toLocaleDateString()
    ]);

    const csvContent = [
      headers.join(','),
      ...csvData.map((row) => row.map((cell) => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    showToast('CSV exported successfully!', 'success');
  };

  const exportToExcel = () => {
    const headers = ['Full Name', 'Email', 'Phone', 'Company', 'Job Title', 'Location', 'Source', 'Status', 'Is Active', 'Industry', 'Created At'];
    const csvData = leads.map((lead) => [
      lead.full_name,
      lead.email,
      lead.phone || '',
      lead.company || '',
      lead.job_title || '',
      lead.location || '',
      lead.source || '',
      formatStatusDisplay(lead.status),
      lead.is_active ? 'Active' : 'Inactive',
      lead.industry || '',
      new Date(lead.created_at).toLocaleDateString()
    ]);

    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...csvData.map((row) => row.map((cell) => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    showToast('Excel file exported successfully!', 'success');
  };


// Helper function to read file as text
const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsText(file, 'UTF-8');
  });
};

// Parse CSV line with better handling
const parseCSVLine = (line: string): string[] => {
  try {
    // Remove any problematic Unicode characters
    const cleanLine = line.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
    
    // Try to parse with regex for quoted fields
    const matches = cleanLine.match(/(".*?"|[^",\t]+)(?=\s*[,|\t]\s*|$)/g);
    
    if (matches) {
      return matches.map(value => {
        // Remove quotes and trim
        let cleaned = value.trim();
        if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
          cleaned = cleaned.slice(1, -1);
        }
        // Replace escaped quotes
        cleaned = cleaned.replace(/""/g, '"');
        // Remove any remaining special characters
        cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F\\]/g, '');
        return cleaned;
      });
    }
    
    // Fallback: split by comma or tab
    if (line.includes('\t')) {
      return line.split('\t').map(v => v.trim().replace(/^"|"$/g, ''));
    }
    
    return line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    
  } catch (error) {
    // Ultimate fallback
    return line.split(/\s+/).filter(v => v.trim() !== '');
  }
};

// Create lead object from CSV values
const createLeadFromCSVValues = (values: string[], userId?: string): any => {
  // Ensure we have enough values, pad with empty strings if needed
  while (values.length < 10) {
    values.push('');
  }
  
  return {
    full_name: values[0] || '',
    email: values[1] || '',
    phone: values[2] || '',
    company: values[3] || '',
    job_title: values[4] || '',
    location: values[5] || '',
    source: values[6] || 'Other',
    status: ((values[7] || 'new').toLowerCase() as 'new' | 'open' | 'important'),
    is_active: values[8] ? 
      (values[8].toLowerCase() === 'active' || values[8].toLowerCase() === 'true') : 
      true,
    industry: values[9] || '',
    user_id: userId || '',
    created_at: new Date().toISOString()
  };
};

// Create lead object from Excel values
const createLeadFromExcelValues = (values: string[], userId?: string): any => {
  // Ensure we have enough values
  while (values.length < 10) {
    values.push('');
  }
  
  return {
    full_name: values[0] || '',
    email: values[1] || '',
    phone: values[2] || '',
    company: values[3] || '',
    job_title: values[4] || '',
    location: values[5] || '',
    source: values[6] || 'Other',
    status: ((values[7] || 'new').toLowerCase() as 'new' | 'open' | 'important'),
    is_active: values[8] ? 
      (values[8].toLowerCase() === 'active' || values[8].toLowerCase() === 'true') : 
      true,
    industry: values[9] || '',
    user_id: userId || '',
    created_at: new Date().toISOString()
  };
};

// Main import function
const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  // File type check
  const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
  const isCSV = file.name.endsWith('.csv');
  
  if (!isExcel && !isCSV) {
    showToast('Please upload CSV or Excel file only', 'error');
    return;
  }

  try {
    showToast('Processing import...', 'info');
    const importedLeads = [];
    
    if (isCSV) {
      // CSV handling
      const text = await readFileAsText(file);
      const lines = text.split('\n').filter(line => line.trim() !== '');
      
      if (lines.length === 0) {
        showToast('No data found in CSV file', 'error');
        return;
      }

      // Check if first line contains headers
      const firstLine = lines[0].toLowerCase();
      const hasHeaders = firstLine.includes('full_name') || 
                        firstLine.includes('name') || 
                        firstLine.includes('email') ||
                        firstLine.includes('full name');
      
      const startIndex = hasHeaders ? 1 : 0;

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = parseCSVLine(line);
        
        if (values.length >= 2) {
          const lead = createLeadFromCSVValues(values, user?.id);
          
          // Validate required fields
          if (lead.full_name && lead.email) {
            importedLeads.push(lead);
          }
        }
      }
      
    } else if (isExcel) {
      // EXCEL handling using xlsx library
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      // Get first worksheet
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Convert to JSON array
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (jsonData.length === 0) {
        showToast('No data found in Excel file', 'error');
        return;
      }

      // Determine if first row is header
      const firstRow = jsonData[0] as any[];
      const hasHeaders = firstRow && (
        (firstRow[0] && firstRow[0].toString().toLowerCase().includes('name')) ||
        (firstRow[1] && firstRow[1].toString().toLowerCase().includes('email'))
      );
      
      const startIndex = hasHeaders ? 1 : 0;

      for (let i = startIndex; i < jsonData.length; i++) {
        const row = jsonData[i] as any[];
        if (!row || row.length === 0) continue;
        
        // Convert row to string values
        const values = row.map(cell => {
          if (cell === null || cell === undefined) return '';
          return cell.toString().trim();
        });
        
        if (values.length >= 2 && values[0] && values[1]) {
          const lead = createLeadFromExcelValues(values, user?.id);
          
          if (lead.full_name && lead.email) {
            importedLeads.push(lead);
          }
        }
      }
    }

    if (importedLeads.length > 0 && user) {
      // Insert in batches to avoid timeout
      const batchSize = 50;
      let importedCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < importedLeads.length; i += batchSize) {
        const batch = importedLeads.slice(i, i + batchSize);
        const { error } = await supabase.from('leads').insert(batch);
        
        if (error) {
          console.error('Import batch error:', error);
          errorCount++;
          // Continue with next batch even if one fails
          continue;
        }
        
        importedCount += batch.length;
      }
      
      if (errorCount > 0) {
        showToast(`Imported ${importedCount} leads with ${errorCount} errors`, 'info');
      } else {
        showToast(`Successfully imported ${importedCount} leads!`, 'success');
      }
      
      setIsImportModalOpen(false);
      await fetchAllData();
      
      // Reset file input
      if (e.target) {
        e.target.value = '';
      }
    } else {
      showToast('No valid leads found in file. Make sure file has at least Name and Email columns.', 'error');
    }
  } catch (error: any) {
    console.error('Import processing error:', error);
    showToast(`Failed to process file: ${error.message}`, 'error');
  }
};

  // Filter follow-ups when filter changes
  useEffect(() => {
    if (allFollowUps.length > 0) {
      let filtered = allFollowUps.filter(f => !f.completed);
      
      if (followUpFilter === 'today') {
        const today = new Date().toISOString().split('T')[0];
        filtered = filtered.filter(f => f.follow_up_date === today);
      }
      
      // Only show follow-ups for active leads
      filtered = filtered.filter(f => f.leads?.is_active !== false);
      
      setFollowUps(filtered);
    }
  }, [followUpFilter, allFollowUps]);

  const filteredLeads = getFilteredAndSortedLeads();
  const activeLeads = filteredLeads.filter(lead => lead.is_active === true);
  const filteredTasks = getFilteredTasks();

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg border border-gray-300 p-8 text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Lead Management System</h1>
          <p className="text-gray-600 mb-6">Please sign in to access your leads</p>
          
          <button
            onClick={signInWithGoogle}
            className="w-full bg-white border border-gray-300 hover:border-gray-400 text-gray-700 px-6 py-3 rounded font-medium transition-all flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded border ${
          toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
          toast.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
          'bg-blue-50 border-blue-200 text-blue-800'
        } font-medium`}>
          {toast.message}
        </div>
      )}

      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 border-r border-gray-300 min-h-screen bg-gray-50">
          <div className="p-6">
            <h1 className="text-xl font-bold text-gray-900 mb-8">Lead Management</h1>
            
            <div className="space-y-1">
              <button
                onClick={() => setActiveTab('all-leads')}
                className={`w-full text-left px-4 py-3 rounded flex items-center gap-3 ${
                  activeTab === 'all-leads' 
                    ? 'bg-black text-white' 
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                📊 All Leads ({leads.length})
              </button>
              
              <button
                onClick={() => setActiveTab('active-leads')}
                className={`w-full text-left px-4 py-3 rounded flex items-center gap-3 ${
                  activeTab === 'active-leads' 
                    ? 'bg-black text-white' 
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                ✅ Active Leads ({activeLeads.length})
              </button>
              
              <button
                onClick={() => setActiveTab('followups')}
                className={`w-full text-left px-4 py-3 rounded flex items-center gap-3 ${
                  activeTab === 'followups' 
                    ? 'bg-black text-white' 
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                🔔 Follow-ups ({followUps.length})
              </button>
              
              <button
                onClick={() => setActiveTab('tasks')}
                className={`w-full text-left px-4 py-3 rounded flex items-center gap-3 ${
                  activeTab === 'tasks' 
                    ? 'bg-black text-white' 
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                ✓ Tasks ({tasks.filter((t) => !t.completed).length})
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {activeTab === 'all-leads' && 'All Leads'}
                {activeTab === 'active-leads' && 'Active Leads'}
                {activeTab === 'followups' && 'Follow-ups'}
                {activeTab === 'tasks' && 'Tasks'}
              </h2>
              <p className="text-gray-600">Welcome, {user.full_name || user.email}</p>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                {user.avatar_url ? (
                  <div className="relative w-8 h-8 rounded-full overflow-hidden border border-gray-300">
                    <Image
                      src={user.avatar_url}
                      alt={user.full_name || user.email}
                      fill
                      className="object-cover"
                      sizes="32px"
                    />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-white font-bold">
                    {(user.full_name || user.email).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-right">
                  <p className="font-medium text-gray-900 text-sm">{user.full_name || user.email}</p>
                </div>
              </div>
              <button
                onClick={signOut}
                className="bg-gray-800 hover:bg-black text-white px-4 py-2 rounded text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>

          {/* Content Area */}
          {activeTab === 'all-leads' && (
            <div className="bg-white border border-gray-300 rounded-lg p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <h3 className="text-xl font-bold text-gray-900">Lead Management</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="border border-gray-300 hover:border-gray-400 text-gray-700 px-4 py-2 rounded text-sm"
                  >
                    📥 Import
                  </button>
                  <button
                    onClick={exportToCSV}
                    className="border border-gray-300 hover:border-gray-400 text-gray-700 px-4 py-2 rounded text-sm"
                  >
                    📄 CSV
                  </button>
                  <button
                    onClick={exportToExcel}
                    className="border border-gray-300 hover:border-gray-400 text-gray-700 px-4 py-2 rounded text-sm"
                  >
                    📊 Excel
                  </button>
                  <button
                    onClick={() => setIsLeadModalOpen(true)}
                    className="bg-black hover:bg-gray-800 text-white px-4 py-2 rounded text-sm"
                  >
                    + Add Lead
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                <input
                  type="text"
                  placeholder="Search leads..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                />
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                >
                  <option value="All">All Sources</option>
                  <option value="Website">Website</option>
                  <option value="Instagram">Instagram</option>
                  <option value="Facebook">Facebook</option>
                  <option value="Cold Call">Cold Call</option>
                  <option value="Other">Other</option>
                </select>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="name">Name (A-Z)</option>
                  <option value="company">Company (A-Z)</option>
                </select>
              </div>

              <div className="overflow-x-auto border border-gray-300 rounded">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 border-r border-gray-300">Name</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 border-r border-gray-300">Email</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 border-r border-gray-300 hidden md:table-cell">Phone</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 border-r border-gray-300 hidden md:table-cell">Company</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 border-r border-gray-300">Source</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 border-r border-gray-300">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 border-r border-gray-300">Active</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-300">
                    {filteredLeads.map((lead, index) => (
                      <tr key={lead.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm border-r border-gray-300">{lead.full_name}</td>
                        <td className="px-4 py-3 text-sm border-r border-gray-300">{lead.email}</td>
                        <td className="px-4 py-3 text-sm border-r border-gray-300 hidden md:table-cell">{lead.phone || '-'}</td>
                        <td className="px-4 py-3 text-sm border-r border-gray-300 hidden md:table-cell">{lead.company || '-'}</td>
                        <td className="px-4 py-3 text-sm border-r border-gray-300">{lead.source || '-'}</td>
                        <td className="px-4 py-3 text-sm border-r border-gray-300">
                          <select
                            value={lead.status}
                            onChange={(e) => updateLeadStatus(lead, e.target.value)}
                            className={`px-2 py-1 rounded text-xs border ${
                              lead.status === 'new' ? 'bg-gray-100' :
                              lead.status === 'open' ? 'bg-gray-200' :
                              'bg-gray-300'
                            }`}
                          >
                            <option value="new">New</option>
                            <option value="open">Open</option>
                            <option value="important">Important</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm border-r border-gray-300">
                          <select
                            value={lead.is_active ? 'Active' : 'Inactive'}
                            onChange={(e) => updateLeadActiveStatus(lead, e.target.value === 'Active')}
                            className={`px-2 py-1 rounded text-xs border ${
                              lead.is_active ? 'bg-gray-100' : 'bg-gray-200'
                            }`}
                          >
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => editLead(lead)}
                            className="text-gray-700 hover:text-black mr-3 text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => viewFollowUpHistory(lead)}
                            className="text-gray-700 hover:text-black text-sm"
                          >
                            History
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredLeads.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    No leads found matching your filters
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'active-leads' && (
            <div className="bg-white border border-gray-300 rounded-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900">Active Leads</h3>
              </div>

              <div className="overflow-x-auto border border-gray-300 rounded">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 border-r border-gray-300">Name</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 border-r border-gray-300">Email</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 border-r border-gray-300 hidden md:table-cell">Phone</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 border-r border-gray-300 hidden md:table-cell">Company</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 border-r border-gray-300">Source</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 border-r border-gray-300">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-300">
                    {activeLeads.map((lead, index) => (
                      <tr key={lead.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm border-r border-gray-300">{lead.full_name}</td>
                        <td className="px-4 py-3 text-sm border-r border-gray-300">{lead.email}</td>
                        <td className="px-4 py-3 text-sm border-r border-gray-300 hidden md:table-cell">{lead.phone || '-'}</td>
                        <td className="px-4 py-3 text-sm border-r border-gray-300 hidden md:table-cell">{lead.company || '-'}</td>
                        <td className="px-4 py-3 text-sm border-r border-gray-300">{lead.source || '-'}</td>
                        <td className="px-4 py-3 text-sm border-r border-gray-300">
                          <select
                            value={lead.status}
                            onChange={(e) => updateLeadStatus(lead, e.target.value)}
                            className={`px-2 py-1 rounded text-xs border ${
                              lead.status === 'new' ? 'bg-gray-100' :
                              lead.status === 'open' ? 'bg-gray-200' :
                              'bg-gray-300'
                            }`}
                          >
                            <option value="new">New</option>
                            <option value="open">Open</option>
                            <option value="important">Important</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => {
                              setSelectedLeadForFollowUp(lead.id);
                              setFollowUpForm({ 
                                ...followUpForm, 
                                lead_id: lead.id,
                                set_active: lead.is_active 
                              });
                              setIsFollowUpModalOpen(true);
                            }}
                            className="bg-black hover:bg-gray-800 text-white px-4 py-2 rounded text-sm"
                          >
                            Add Follow-up
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {activeLeads.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    No active leads found
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'followups' && (
            <div className="bg-white border border-gray-300 rounded-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900">Follow-ups</h3>
                <div className="flex items-center gap-4">
                  <div className="flex border border-gray-300 rounded">
                    <button
                      onClick={() => setFollowUpFilter('all')}
                      className={`px-4 py-2 text-sm ${
                        followUpFilter === 'all' 
                          ? 'bg-black text-white' 
                          : 'bg-white text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setFollowUpFilter('today')}
                      className={`px-4 py-2 text-sm ${
                        followUpFilter === 'today' 
                          ? 'bg-black text-white' 
                          : 'bg-white text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      Today
                    </button>
                  </div>
                  <button
                    onClick={() => setIsFollowUpModalOpen(true)}
                    className="bg-black hover:bg-gray-800 text-white px-4 py-2 rounded text-sm"
                  >
                    + Add Follow-up
                  </button>
                  <button
                    onClick={viewAllFollowUpHistory}
                    className="border border-gray-300 hover:border-gray-400 text-gray-700 px-4 py-2 rounded text-sm"
                  >
                    📜 All History
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {followUps.map((followUp) => (
                  <div
                    key={followUp.id}
                    className="border border-gray-300 rounded p-4 bg-white"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-900">{followUp.leads?.full_name || 'Unknown Lead'}</h4>
                          <span className={`px-2 py-1 rounded text-xs ${
                            followUp.leads?.status === 'new' ? 'bg-gray-100 text-gray-700' :
                            followUp.leads?.status === 'open' ? 'bg-gray-200 text-gray-700' :
                            'bg-gray-300 text-gray-700'
                          }`}>
                            {followUp.leads?.status ? formatStatusDisplay(followUp.leads.status) : 'New'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{followUp.leads?.email || 'No email'}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-sm text-gray-600">
                            📅 {new Date(followUp.follow_up_date).toLocaleDateString()}
                          </span>   
                        </div>
                        {followUp.remarks && (
                          <p className="text-sm text-gray-700 mt-2">📝 {followUp.remarks}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedLeadForFollowUp(followUp.lead_id);
                            setFollowUpForm({ 
                              lead_id: followUp.lead_id,
                              follow_up_date: '',
                              remarks: '',
                              set_active: true
                            });
                            setIsFollowUpModalOpen(true);
                          }}
                          className="border border-gray-300 hover:border-gray-400 text-gray-700 px-3 py-1 rounded text-sm"
                        >
                          Add Follow-up
                        </button>
                        <button
                          onClick={() => viewFollowUpHistoryForLead(followUp.lead_id)}
                          className="border border-gray-300 hover:border-gray-400 text-gray-700 px-3 py-1 rounded text-sm"
                        >
                          📜 History
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {followUps.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <p>No follow-ups found</p>
                    <p className="text-sm text-gray-500 mt-2">Add follow-ups to active leads</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="bg-white border border-gray-300 rounded-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900">Tasks</h3>
                <div className="flex items-center gap-4">
                  <div className="flex border border-gray-300 rounded">
                    <button
                      onClick={() => setTaskFilter('all')}
                      className={`px-4 py-2 text-sm ${
                        taskFilter === 'all' 
                          ? 'bg-black text-white' 
                          : 'bg-white text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      All Tasks
                    </button>
                    <button
                      onClick={() => setTaskFilter('today')}
                      className={`px-4 py-2 text-sm ${
                        taskFilter === 'today' 
                          ? 'bg-black text-white' 
                          : 'bg-white text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      Today
                    </button>
                  </div>
                  <button
                    onClick={() => setIsTaskModalOpen(true)}
                    className="bg-black hover:bg-gray-800 text-white px-4 py-2 rounded text-sm"
                  >
                    + Add Task
                  </button>
                </div>
              </div>
              
              <div className="space-y-3">
                {filteredTasks.map((task, index) => (
                  <div
                    key={task.id}
                    className={`border border-gray-300 rounded p-4 ${
                      task.completed ? 'bg-gray-50' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => toggleTaskComplete(task)}
                        className="mt-1 w-5 h-5 text-black rounded border-gray-300 focus:ring-black"
                      />
                      <div className="flex-1">
                        <h4 className={`font-medium ${
                          task.completed ? 'line-through text-gray-500' : 'text-gray-900'
                        }`}>
                          {task.title}
                        </h4>
                        {task.description && (
                          <p className={`text-sm mt-1 ${
                            task.completed ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            {task.description}
                          </p>
                        )}
                        <p className={`text-sm mt-2 ${
                          task.completed ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          📅 Due: {new Date(task.due_date).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => editTask(task)}
                        className="text-gray-700 hover:text-black text-sm"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
                {filteredTasks.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <p>No tasks found</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {isLeadModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-xl font-bold mb-4">
              {editingItem ? 'Edit Lead' : 'Add New Lead'}
            </h3>
            <form onSubmit={addOrUpdateLead} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Full Name *</label>
                <input
                  type="text"
                  required
                  value={leadForm.full_name}
                  onChange={(e) => setLeadForm({ ...leadForm, full_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Email *</label>
                <input
                  type="email"
                  required
                  value={leadForm.email}
                  onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Phone</label>
                  <input
                    type="tel"
                    value={leadForm.phone}
                    onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Company</label>
                  <input
                    type="text"
                    value={leadForm.company}
                    onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Job Title</label>
                  <input
                    type="text"
                    value={leadForm.job_title}
                    onChange={(e) => setLeadForm({ ...leadForm, job_title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Location</label>
                  <input
                    type="text"
                    value={leadForm.location}
                    onChange={(e) => setLeadForm({ ...leadForm, location: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Source</label>
                  <select
                    value={leadForm.source}
                    onChange={(e) => setLeadForm({ ...leadForm, source: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                  >
                    <option value="Website">Website</option>
                    <option value="Instagram">Instagram</option>
                    <option value="Facebook">Facebook</option>
                    <option value="Cold Call">Cold Call</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Status</label>
                  <select
                    value={leadForm.status}
                    onChange={(e) => setLeadForm({ ...leadForm, status: e.target.value as any })}
                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                  >
                    <option value="new">New</option>
                    <option value="open">Open</option>
                    <option value="important">Important</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Industry</label>
                <input
                  type="text"
                  value={leadForm.industry}
                  onChange={(e) => setLeadForm({ ...leadForm, industry: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-black hover:bg-gray-800 text-white py-2 rounded font-medium"
                >
                  {editingItem ? 'Update Lead' : 'Add Lead'}
                </button>
                <button
                  type="button"
                  onClick={resetLeadForm}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isFollowUpModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full p-6">
            <h3 className="text-xl font-bold mb-4">
              Add Follow-up
            </h3>
            <form onSubmit={addOrUpdateFollowUp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Lead *</label>
                <select
                  required
                  value={followUpForm.lead_id}
                  onChange={(e) => {
                    const selectedLead = leads.find(l => l.id === e.target.value);
                    setFollowUpForm({ 
                      ...followUpForm, 
                      lead_id: e.target.value,
                      set_active: selectedLead?.is_active ?? true
                    });
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                >
                  <option value="">Select a lead</option>
                  {leads.filter(l => l.is_active).map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.full_name} - {lead.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Follow-up Date *</label>
                <input
                  type="date"
                  required
                  min={getTodayDate()}
                  value={followUpForm.follow_up_date}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, follow_up_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Remarks</label>
                <textarea
                  value={followUpForm.remarks}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, remarks: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                  placeholder="e.g., Call Not Pick, Meeting scheduled, etc."
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="block text-sm font-medium">Lead Active Status:</label>
                <div className="flex border border-gray-300 rounded overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setFollowUpForm({ ...followUpForm, set_active: true })}
                    className={`px-4 py-2 text-sm ${
                      followUpForm.set_active 
                        ? 'bg-black text-white' 
                        : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setFollowUpForm({ ...followUpForm, set_active: false })}
                    className={`px-4 py-2 text-sm ${
                      !followUpForm.set_active 
                        ? 'bg-black text-white' 
                        : 'bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    Inactive
                  </button>
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-black hover:bg-gray-800 text-white py-2 rounded font-medium"
                >
                  Schedule Follow-up
                </button>
                <button
                  type="button"
                  onClick={resetFollowUpForm}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isTaskModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full p-6">
            <h3 className="text-xl font-bold mb-4">
              {editingItem ? 'Edit Task' : 'Add New Task'}
            </h3>
            <form onSubmit={addOrUpdateTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Title *</label>
                <input
                  type="text"
                  required
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Due Date *</label>
                <input
                  type="date"
                  required
                  min={getTodayDate()}
                  value={taskForm.due_date}
                  onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-gray-500"
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  className="flex-1 bg-black hover:bg-gray-800 text-white py-2 rounded font-medium"
                >
                  {editingItem ? 'Update Task' : 'Add Task'}
                </button>
                <button
                  type="button"
                  onClick={resetTaskForm}
                  className="flex-1 border border-gray-300 text-gray-700 py-2 rounded hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isHistoryModalOpen && selectedLead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Follow-up History - {selectedLead.full_name}</h3>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>

            <div className="mb-6">
              <p className="text-sm text-gray-700 mb-2">
                <span className="font-medium">Lead:</span> {selectedLead.full_name}
              </p>
              <p className="text-sm text-gray-700 mb-2">
                <span className="font-medium">Email:</span> {selectedLead.email}
              </p>
              <p className="text-sm text-gray-700 mb-2">
                <span className="font-medium">Phone:</span> {selectedLead.phone || 'N/A'}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-medium">Status:</span> {formatStatusDisplay(selectedLead.status)}
              </p>
            </div>

            <div className="border border-gray-300 rounded overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold border-r border-gray-300">Date Added</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold border-r border-gray-300">Scheduled For</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold border-r border-gray-300">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-300">
                  {followUpHistory.map((history) => (
                    <tr key={history.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm border-r border-gray-300">
                        {new Date(history.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm border-r border-gray-300">
                        {new Date(history.follow_up_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm border-r border-gray-300">
                        {history.remarks || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={saveHistoryAsPDF}
                className="flex-1 bg-black hover:bg-gray-800 text-white py-2 rounded"
              >
                Save as PDF
              </button>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isFollowUpHistoryModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">All Follow-up History</h3>
              <button
                onClick={() => setIsFollowUpHistoryModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>

            <div className="mb-6">
              <p className="text-sm text-gray-700">
                <span className="font-medium">Total Follow-ups:</span> {followUpHistory.length}
              </p>
            </div>

            <div className="border border-gray-300 rounded overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold border-r border-gray-300">Lead Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold border-r border-gray-300">Date Added</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold border-r border-gray-300">Scheduled For</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold border-r border-gray-300">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-300">
                  {followUpHistory.map((history) => (
                    <tr key={history.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm border-r border-gray-300">
                        {history.leads?.full_name || 'Unknown Lead'}
                      </td>
                      <td className="px-4 py-3 text-sm border-r border-gray-300">
                        {new Date(history.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm border-r border-gray-300">
                        {new Date(history.follow_up_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm border-r border-gray-300">
                        {history.remarks || '-'}
                      </td>    
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={saveHistoryAsPDF}
                className="flex-1 bg-black hover:bg-gray-800 text-white py-2 rounded"
              >
                Save as PDF
              </button>
              <button
                onClick={() => setIsFollowUpHistoryModalOpen(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full p-6">
            <h3 className="text-xl font-bold mb-4">Import Leads</h3>
            <div className="space-y-4">
              <div className="border border-dashed border-gray-300 rounded p-8 text-center">
                <p className="text-gray-700 mb-4">Upload CSV or Excel file</p>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileImport}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="inline-block bg-black hover:bg-gray-800 text-white px-6 py-2 rounded cursor-pointer"
                >
                  Choose File
                </label>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="w-full border border-gray-300 text-gray-700 py-2 rounded hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
