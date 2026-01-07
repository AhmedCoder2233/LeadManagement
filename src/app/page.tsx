'use client';

import { createClient } from '@supabase/supabase-js';
import { useEffect, useState, useCallback } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import Image from 'next/image';

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
  leads?: { full_name: string; email: string };
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

interface LeadWithFollowUps extends Lead {
  follow_ups: FollowUp[];
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
  const [leadsWithFollowUps, setLeadsWithFollowUps] = useState<LeadWithFollowUps[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
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
    remarks: ''
  });

  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    due_date: ''
  });

  // Fetch all data with useCallback to prevent infinite re-renders
  const fetchAllData = useCallback(async () => {
    if (!user) return;
    
    await fetchLeads();
    await fetchFollowUps();
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

  const fetchFollowUps = async () => {
  if (!user) return;

  try {
    // Fetch all pending follow-ups
    const { data: followUpsData, error: followUpsError } = await supabase
      .from('follow_ups')
      .select('*, leads(full_name, email)')
      .eq('user_id', user.id)
      .eq('completed', false)
      .order('follow_up_date', { ascending: true });

    if (followUpsError) {
      console.error('Follow-ups fetch error:', followUpsError);
      return;
    }

    if (followUpsData) {
      // Sort follow-ups for display: today's follow-ups first, then upcoming, then past
      const sortedFollowUps = followUpsData.sort((a, b) => {
        const dateA = new Date(a.follow_up_date);
        const dateB = new Date(b.follow_up_date);
        const today = new Date();
        
        // Reset time parts to compare only dates
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const dateAOnly = new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
        const dateBOnly = new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
        
        // Check if dates are today
        const isAToday = dateAOnly.getTime() === todayStart.getTime();
        const isBToday = dateBOnly.getTime() === todayStart.getTime();
        
        // If both are today, keep original order (closest time first)
        if (isAToday && isBToday) {
          return dateA.getTime() - dateB.getTime();
        }
        
        // If one is today and one is not, put today first
        if (isAToday && !isBToday) return -1;
        if (!isAToday && isBToday) return 1;
        
        // Check if dates are upcoming (future dates)
        const isAFuture = dateAOnly > todayStart;
        const isBFuture = dateBOnly > todayStart;
        
        // If both are future dates, show closest date first
        if (isAFuture && isBFuture) {
          return dateA.getTime() - dateB.getTime();
        }
        
        // If one is future and one is past, put future first
        if (isAFuture && !isBFuture) return -1;
        if (!isAFuture && isBFuture) return 1;
        
        // Both are past dates (but not today), show most recent past first
        return dateB.getTime() - dateA.getTime();
      });
      
      setFollowUps(sortedFollowUps);

      // Now fetch leads with their follow-ups
      const { data: leadsData, error: leadsError } = await supabase
        .from('leads')
        .select('*, follow_ups(*)')
        .eq('user_id', user.id)
        .eq('follow_ups.completed', false)
        .eq('follow_ups.user_id', user.id);

      if (leadsError) {
        console.error('Leads with follow-ups fetch error:', leadsError);
        return;
      }

      if (leadsData) {
        const leadsWithFollowUpsData = leadsData.map(lead => {
          // Get lead's follow-ups and sort them properly
          const leadFollowUps = followUpsData
            .filter(f => f.lead_id === lead.id)
            .sort((a, b) => {
              const dateA = new Date(a.follow_up_date);
              const dateB = new Date(b.follow_up_date);
              const today = new Date();
              const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
              const dateAOnly = new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
              const dateBOnly = new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
              
              // Check if dates are today
              const isAToday = dateAOnly.getTime() === todayStart.getTime();
              const isBToday = dateBOnly.getTime() === todayStart.getTime();
              
              // Today's follow-ups first
              if (isAToday && !isBToday) return -1;
              if (!isAToday && isBToday) return 1;
              
              // Check if dates are future
              const isAFuture = dateAOnly > todayStart;
              const isBFuture = dateBOnly > todayStart;
              
              // Future dates before past dates
              if (isAFuture && !isBFuture) return -1;
              if (!isAFuture && isBFuture) return 1;
              
              // If both are future or both are past, sort by date
              if (isAFuture && isBFuture) {
                return dateA.getTime() - dateB.getTime(); // Future: closest first
              }
              
              // Both are past (but not today), most recent first
              return dateB.getTime() - dateA.getTime();
            });
          
          return {
            ...lead,
            follow_ups: leadFollowUps
          };
        });
        
        // Sort leads based on their follow-ups: leads with today's follow-ups first
        leadsWithFollowUpsData.sort((a, b) => {
          const today = new Date();
          const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          
          const aHasToday = a.follow_ups.some((f: any) => {
            const followUpDate = new Date(f.follow_up_date);
            const followUpDateOnly = new Date(followUpDate.getFullYear(), followUpDate.getMonth(), followUpDate.getDate());
            return followUpDateOnly.getTime() === todayStart.getTime();
          });
          
          const bHasToday = b.follow_ups.some((f: any) => {
            const followUpDate = new Date(f.follow_up_date);
            const followUpDateOnly = new Date(followUpDate.getFullYear(), followUpDate.getMonth(), followUpDate.getDate());
            return followUpDateOnly.getTime() === todayStart.getTime();
          });
          
          // Leads with today's follow-ups first
          if (aHasToday && !bHasToday) return -1;
          if (!aHasToday && bHasToday) return 1;
          
          // If both have today's follow-ups, sort by time
          if (aHasToday && bHasToday) {
            const aNextToday = a.follow_ups.find((f: any) => {
              const followUpDate = new Date(f.follow_up_date);
              const followUpDateOnly = new Date(followUpDate.getFullYear(), followUpDate.getMonth(), followUpDate.getDate());
              return followUpDateOnly.getTime() === todayStart.getTime();
            });
            
            const bNextToday = b.follow_ups.find((f: any) => {
              const followUpDate = new Date(f.follow_up_date);
              const followUpDateOnly = new Date(followUpDate.getFullYear(), followUpDate.getMonth(), followUpDate.getDate());
              return followUpDateOnly.getTime() === todayStart.getTime();
            });
            
            return new Date(aNextToday?.follow_up_date || 0).getTime() - 
                   new Date(bNextToday?.follow_up_date || 0).getTime();
          }
          
          // Check for upcoming follow-ups (future dates)
          const aHasUpcoming = a.follow_ups.some((f: any) => {
            const followUpDate = new Date(f.follow_up_date);
            const followUpDateOnly = new Date(followUpDate.getFullYear(), followUpDate.getMonth(), followUpDate.getDate());
            return followUpDateOnly > todayStart;
          });
          
          const bHasUpcoming = b.follow_ups.some((f: any) => {
            const followUpDate = new Date(f.follow_up_date);
            const followUpDateOnly = new Date(followUpDate.getFullYear(), followUpDate.getMonth(), followUpDate.getDate());
            return followUpDateOnly > todayStart;
          });
          
          // If both have upcoming, sort by closest upcoming date
          if (aHasUpcoming && bHasUpcoming) {
            const aNext = a.follow_ups.find((f: any) => {
              const followUpDate = new Date(f.follow_up_date);
              const followUpDateOnly = new Date(followUpDate.getFullYear(), followUpDate.getMonth(), followUpDate.getDate());
              return followUpDateOnly > todayStart;
            });
            const bNext = b.follow_ups.find((f: any) => {
              const followUpDate = new Date(f.follow_up_date);
              const followUpDateOnly = new Date(followUpDate.getFullYear(), followUpDate.getMonth(), followUpDate.getDate());
              return followUpDateOnly > todayStart;
            });
            return new Date(aNext?.follow_up_date || 0).getTime() - 
                   new Date(bNext?.follow_up_date || 0).getTime();
          }
          
          // If only one has upcoming, put it first
          if (aHasUpcoming && !bHasUpcoming) return -1;
          if (!aHasUpcoming && bHasUpcoming) return 1;
          
          // Both only have past follow-ups (not today), sort by most recent past
          const aLatest = a.follow_ups[0];
          const bLatest = b.follow_ups[0];
          return new Date(bLatest?.follow_up_date || 0).getTime() - 
                 new Date(aLatest?.follow_up_date || 0).getTime();
        });
        
        setLeadsWithFollowUps(leadsWithFollowUpsData);
      }
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
        setTimeout(() => window.location.reload(), 1000); // Force reload after update
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
        setTimeout(() => window.location.reload(), 1000); // Force reload after add
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
    
    if (new Date(followUpForm.follow_up_date) < new Date(getTodayDate())) {
      showToast('Follow-up date cannot be in the past!', 'error');
      return;
    }
    
    if (editingItem) {
      const { error } = await supabase
        .from('follow_ups')
        .update(followUpForm)
        .eq('id', editingItem.id)
        .eq('user_id', user.id);
      if (!error) {
        resetFollowUpForm();
        showToast('Follow-up updated successfully!', 'success');
        setTimeout(() => window.location.reload(), 1000); // Force reload after update
      } else {
        showToast('Failed to update follow-up', 'error');
      }
    } else {
      const { error } = await supabase.from('follow_ups').insert([{
        ...followUpForm,
        user_id: user.id,
        created_at: new Date().toISOString(),
        completed: false
      }]);
      if (!error) {
        resetFollowUpForm();
        showToast('Follow-up scheduled successfully!', 'success');
        setTimeout(() => window.location.reload(), 1000); // Force reload after add
      } else {
        showToast('Failed to schedule follow-up', 'error');
      }
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
        setTimeout(() => window.location.reload(), 1000); // Force reload after update
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
        setTimeout(() => window.location.reload(), 1000); // Force reload after add
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
      setTimeout(() => window.location.reload(), 1000); // Force reload after status change
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
      setTimeout(() => window.location.reload(), 1000); // Force reload after active status change
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
      setTimeout(() => window.location.reload(), 1000); // Force reload after task complete
    } else {
      showToast('Failed to update task', 'error');
    }
  };

  const completeFollowUp = async (followUp: FollowUp) => {
    if (!user) return;
    
    const { error } = await supabase
      .from('follow_ups')
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq('id', followUp.id)
      .eq('user_id', user.id);
    if (!error) {
      showToast('Follow-up marked as completed!', 'success');
      setTimeout(() => window.location.reload(), 1000); // Force reload after follow-up complete
    } else {
      showToast('Failed to complete follow-up', 'error');
    }
  };

  const viewFollowUpHistory = async (lead: Lead) => {
    if (!user) return;
    
    setSelectedLead(lead);
    const { data, error } = await supabase
      .from('follow_ups')
      .select('*')
      .eq('lead_id', lead.id)
      .eq('user_id', user.id)
      .order('follow_up_date', { ascending: false });
    if (!error && data) {
      setFollowUpHistory(data);
      setIsHistoryModalOpen(true);
    }
  };

  const saveHistoryAsPDF = async () => {
    if (!selectedLead || followUpHistory.length === 0) return;

    const element = document.createElement('div');
    element.innerHTML = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto;">
        <h1 style="color: #1f2937; border-bottom: 3px solid #8b5cf6; padding-bottom: 10px;">
          Follow-up History - ${selectedLead.full_name}
        </h1>
        <div style="margin: 20px 0; color: #4b5563;">
          <strong>Lead Name:</strong> ${selectedLead.full_name}<br>
          <strong>Email:</strong> ${selectedLead.email}<br>
          <strong>Company:</strong> ${selectedLead.company || 'N/A'}<br>
          <strong>Phone:</strong> ${selectedLead.phone || 'N/A'}<br>
          <strong>Status:</strong> ${formatStatusDisplay(selectedLead.status)}<br>
          <strong>Active Status:</strong> ${selectedLead.is_active ? 'Active' : 'Inactive'}<br>
          <strong>Report Generated:</strong> ${new Date().toLocaleString()}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <thead>
            <tr style="background-color: #8b5cf6; color: white;">
              <th style="padding: 12px; text-align: left;">Date Added</th>
              <th style="padding: 12px; text-align: left;">Follow-up Date</th>
              <th style="padding: 12px; text-align: left;">Remarks</th>
              <th style="padding: 12px; text-align: left;">Status</th>
              <th style="padding: 12px; text-align: left;">Completed Date</th>
            </tr>
          </thead>
          <tbody>
            ${followUpHistory.map(h => `
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 10px;">${new Date(h.created_at).toLocaleDateString()}</td>
                <td style="padding: 10px;">${new Date(h.follow_up_date).toLocaleDateString()}</td>
                <td style="padding: 10px;">${h.remarks || '-'}</td>
                <td style="padding: 10px;">
                  <span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; ${h.completed ? 'background-color: #10b981; color: white;' : 'background-color: #f59e0b; color: white;'}">
                    ${h.completed ? 'Completed' : 'Pending'}
                  </span>
                </td>
                <td style="padding: 10px;">${h.completed_at ? new Date(h.completed_at).toLocaleDateString() : '-'}</td>
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

      pdf.save(`FollowUpHistory_${selectedLead.full_name}_${new Date().toISOString().split('T')[0]}.pdf`);
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
      remarks: ''
    });
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
      remarks: followUp.remarks || ''
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

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));

      const importedLeads = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g)?.map((v) => v.trim().replace(/^"|"$/g, '')) || [];
        
        if (values.length >= 2) {
          const lead = {
            full_name: values[0] || '',
            email: values[1] || '',
            phone: values[2] || '',
            company: values[3] || '',
            job_title: values[4] || '',
            location: values[5] || '',
            source: values[6] || 'Other',
            status: (values[7]?.toLowerCase() || 'new') as 'new' | 'open' | 'important',
            is_active: values[8]?.toLowerCase() === 'active' || true,
            industry: values[9] || '',
            user_id: user?.id || '',
            created_at: new Date().toISOString()
          };
          importedLeads.push(lead);
        }
      }

      if (importedLeads.length > 0 && user) {
        const { error } = await supabase.from('leads').insert(importedLeads);
        if (!error) {
          showToast(`Successfully imported ${importedLeads.length} leads!`, 'success');
          setIsImportModalOpen(false);
          setTimeout(() => window.location.reload(), 1000); // Force reload after import
        } else {
          showToast(`Error importing leads: ${error.message}`, 'error');
        }
      }
    };
    reader.readAsText(file);
  };

  const filteredLeads = getFilteredAndSortedLeads();
  const activeLeads = filteredLeads.filter(lead => lead.is_active === true);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Lead Management System</h1>
          <p className="text-gray-600 mb-6">Please sign in to access your leads</p>
          
          <button
            onClick={signInWithGoogle}
            className="w-full bg-white border-2 border-gray-300 hover:border-gray-400 text-gray-700 px-6 py-3 rounded-lg font-medium transition-all hover:shadow-lg flex items-center justify-center gap-3"
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-4 md:p-8">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-4 rounded-xl shadow-2xl animate-slideDown ${
          toast.type === 'success' ? 'bg-gradient-to-r from-green-500 to-emerald-500' :
          toast.type === 'error' ? 'bg-gradient-to-r from-red-500 to-pink-500' :
          'bg-gradient-to-r from-blue-500 to-indigo-500'
        } text-white font-medium`}>
          {toast.message}
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-2">
              Lead Management System
            </h1>
            <p className="text-gray-600">Welcome, {user.full_name || user.email}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {user.avatar_url ? (
                <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-lg">
                  <Image
                    src={user.avatar_url}
                    alt={user.full_name || user.email}
                    fill
                    className="object-cover"
                    sizes="40px"
                  />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center justify-center text-white font-bold shadow-lg">
                  {(user.full_name || user.email).charAt(0).toUpperCase()}
                </div>
              )}
              <div className="text-right hidden md:block">
                <p className="font-medium text-gray-800">{user.full_name || user.email}</p>
                <p className="text-sm text-gray-500">Sales Representative</p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-all hover:scale-105 shadow-md text-sm md:text-base"
            >
              Sign Out
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
          <button
            onClick={() => setActiveTab('all-leads')}
            className={`p-4 rounded-xl font-semibold transition-all duration-300 ${
              activeTab === 'all-leads'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl scale-105'
                : 'bg-white text-gray-700 hover:shadow-lg'
            }`}
          >
            <div className="text-2xl mb-1">📊</div>
            <div className="text-sm md:text-base">Total Leads</div>
            <div className="text-lg md:text-xl font-bold">{leads.length}</div>
          </button>
          <button
            onClick={() => setActiveTab('active-leads')}
            className={`p-4 rounded-xl font-semibold transition-all duration-300 ${
              activeTab === 'active-leads'
                ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-xl scale-105'
                : 'bg-white text-gray-700 hover:shadow-lg'
            }`}
          >
            <div className="text-2xl mb-1">✅</div>
            <div className="text-sm md:text-base">Active Leads</div>
            <div className="text-lg md:text-xl font-bold">{activeLeads.length}</div>
          </button>
          <button
            onClick={() => setActiveTab('followups')}
            className={`p-4 rounded-xl font-semibold transition-all duration-300 ${
              activeTab === 'followups'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-xl scale-105'
                : 'bg-white text-gray-700 hover:shadow-lg'
            }`}
          >
            <div className="text-2xl mb-1">🔔</div>
            <div className="text-sm md:text-base">Follow-ups</div>
            <div className="text-lg md:text-xl font-bold">{followUps.length}</div>
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`p-4 rounded-xl font-semibold transition-all duration-300 ${
              activeTab === 'tasks'
                ? 'bg-gradient-to-r from-orange-600 to-red-600 text-white shadow-xl scale-105'
                : 'bg-white text-gray-700 hover:shadow-lg'
            }`}
          >
            <div className="text-2xl mb-1">✓</div>
            <div className="text-sm md:text-base">Tasks</div>
            <div className="text-lg md:text-xl font-bold">{tasks.filter((t) => !t.completed).length}</div>
          </button>
        </div>

        {activeTab === 'all-leads' && (
          <div className="bg-white rounded-2xl shadow-xl p-4 md:p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-800">All Leads</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-all hover:scale-105 shadow-md text-sm md:text-base"
                >
                  📥 Import
                </button>
                <button
                  onClick={exportToCSV}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-all hover:scale-105 shadow-md text-sm md:text-base"
                >
                  📄 CSV
                </button>
                <button
                  onClick={exportToExcel}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-all hover:scale-105 shadow-md text-sm md:text-base"
                >
                  📊 Excel
                </button>
                <button
                  onClick={() => setIsLeadModalOpen(true)}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all hover:scale-105 shadow-md text-sm md:text-base"
                >
                  + Add Lead
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              <input
                type="text"
                placeholder="🔍 Search leads..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
                className="px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="name">Name (A-Z)</option>
                <option value="company">Company (A-Z)</option>
              </select>
            </div>

            <div className="overflow-x-auto rounded-xl border-2 border-gray-100">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                  <tr>
                    <th className="px-4 py-4 text-left text-sm font-semibold">Name</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold">Email</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold hidden md:table-cell">Phone</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold hidden md:table-cell">Company</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold">Source</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold">Status</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold">Is Active</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredLeads.map((lead, index) => (
                    <tr
                      key={lead.id}
                      className="hover:bg-blue-50 transition-all animate-fadeIn"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <td className="px-4 py-4 text-sm font-medium text-gray-900">{lead.full_name}</td>
                      <td className="px-4 py-4 text-sm text-gray-600">{lead.email}</td>
                      <td className="px-4 py-4 text-sm text-gray-600 hidden md:table-cell">{lead.phone || '-'}</td>
                      <td className="px-4 py-4 text-sm text-gray-600 hidden md:table-cell">{lead.company || '-'}</td>
                      <td className="px-4 py-4 text-sm text-gray-600">{lead.source || '-'}</td>
                      <td className="px-4 py-4">
                        <select
                          value={lead.status}
                          onChange={(e) => updateLeadStatus(lead, e.target.value)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                            lead.status === 'new' ? 'bg-blue-500 text-white' :
                            lead.status === 'open' ? 'bg-green-500 text-white' :
                            'bg-orange-500 text-white'
                          }`}
                        >
                          <option value="new">New</option>
                          <option value="open">Open</option>
                          <option value="important">Important</option>
                        </select>
                      </td>
                      <td className="px-4 py-4">
                        <select
                          value={lead.is_active ? 'Active' : 'Inactive'}
                          onChange={(e) => updateLeadActiveStatus(lead, e.target.value === 'Active')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                            lead.is_active
                              ? 'bg-green-500 text-white'
                              : 'bg-red-500 text-white'
                          }`}
                        >
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <button
                          onClick={() => editLead(lead)}
                          className="text-blue-600 hover:text-blue-800 font-medium transition-colors mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => viewFollowUpHistory(lead)}
                          className="text-purple-600 hover:text-purple-800 font-medium transition-colors"
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
          <div className="bg-white rounded-2xl shadow-xl p-4 md:p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-800">Active Leads</h2>
            </div>

            <div className="overflow-x-auto rounded-xl border-2 border-gray-100">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-green-600 to-emerald-600 text-white">
                  <tr>
                    <th className="px-4 py-4 text-left text-sm font-semibold">Name</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold">Email</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold hidden md:table-cell">Phone</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold hidden md:table-cell">Company</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold">Source</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold">Status</th>
                    <th className="px-4 py-4 text-left text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activeLeads.map((lead, index) => (
                    <tr
                      key={lead.id}
                      className="hover:bg-green-50 transition-all animate-fadeIn"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      <td className="px-4 py-4 text-sm font-medium text-gray-900">{lead.full_name}</td>
                      <td className="px-4 py-4 text-sm text-gray-600">{lead.email}</td>
                      <td className="px-4 py-4 text-sm text-gray-600 hidden md:table-cell">{lead.phone || '-'}</td>
                      <td className="px-4 py-4 text-sm text-gray-600 hidden md:table-cell">{lead.company || '-'}</td>
                      <td className="px-4 py-4 text-sm text-gray-600">{lead.source || '-'}</td>
                      <td className="px-4 py-4">
                        <select
                          value={lead.status}
                          onChange={(e) => updateLeadStatus(lead, e.target.value)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                            lead.status === 'new' ? 'bg-blue-500 text-white' :
                            lead.status === 'open' ? 'bg-green-500 text-white' :
                            'bg-orange-500 text-white'
                          }`}
                        >
                          <option value="new">New</option>
                          <option value="open">Open</option>
                          <option value="important">Important</option>
                        </select>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <button
                          onClick={() => {
                            setFollowUpForm({ ...followUpForm, lead_id: lead.id });
                            setIsFollowUpModalOpen(true);
                          }}
                          className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all hover:scale-105 shadow-md text-xs md:text-sm"
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
  <div className="bg-white rounded-2xl shadow-xl p-4 md:p-6">
    <div className="flex justify-between items-center mb-6">
      <h2 className="text-2xl md:text-3xl font-bold text-gray-800">Follow-ups</h2>
      <button
        onClick={() => setIsFollowUpModalOpen(true)}
        className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all hover:scale-105 shadow-md"
      >
        + Add Follow-up
      </button>
    </div>
    <div className="grid gap-4">
      {leadsWithFollowUps.map((leadWithFollowUps, index) => {
        // Get upcoming follow-ups (at least one is upcoming)
        const upcomingFollowUps = leadWithFollowUps.follow_ups.filter(
          f => new Date(f.follow_up_date) >= new Date()
        );
        
        // Get past follow-ups
        const pastFollowUps = leadWithFollowUps.follow_ups.filter(
          f => new Date(f.follow_up_date) < new Date()
        );
        
        // Sort upcoming by closest date
        upcomingFollowUps.sort((a, b) => 
          new Date(a.follow_up_date).getTime() - new Date(b.follow_up_date).getTime()
        );
        
        // Sort past by most recent first
        pastFollowUps.sort((a, b) => 
          new Date(b.follow_up_date).getTime() - new Date(a.follow_up_date).getTime()
        );
        
        // Combine: upcoming first, then past
        const sortedFollowUps = [...upcomingFollowUps, ...pastFollowUps];
        
        const nextFollowUp = sortedFollowUps[0];
        const hasUpcoming = upcomingFollowUps.length > 0;
        const hasPast = pastFollowUps.length > 0;
        
        return (
          <div
            key={leadWithFollowUps.id}
            className={`border-2 rounded-xl p-4 md:p-5 hover:shadow-lg transition-all animate-slideUp ${
              !hasUpcoming && hasPast 
                ? 'border-red-200 bg-gradient-to-r from-red-50 to-orange-50' 
                : hasUpcoming
                ? 'border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50'
                : 'border-gray-200 bg-gray-50'
            }`}
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
              <div className="flex-1 w-full">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg md:text-xl font-semibold text-gray-900">
                    {leadWithFollowUps.full_name}
                  </h3>
                  {!hasUpcoming && hasPast && (
                    <span className="bg-red-500 text-white px-2 py-1 rounded text-xs font-bold">
                      Past Follow-up
                    </span>
                  )}
                  {hasUpcoming && hasPast && (
                    <span className="bg-yellow-500 text-white px-2 py-1 rounded text-xs font-bold">
                      Mixed
                    </span>
                  )}
                  {leadWithFollowUps.follow_ups.length > 1 && (
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                      {leadWithFollowUps.follow_ups.length} follow-ups
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-700">
                    <span className="font-medium text-purple-600">📧 Email:</span>{' '}
                    {leadWithFollowUps.email}
                  </p>
                  
                  {nextFollowUp && (
                    <>
                      <p className="text-sm text-gray-700">
                        <span className="font-medium text-purple-600">📅 Next Follow-up:</span>{' '}
                        {new Date(nextFollowUp.follow_up_date).toLocaleDateString()}
                        {new Date(nextFollowUp.follow_up_date) < new Date() && (
                          <span className="ml-2 bg-red-100 text-red-800 px-2 py-1 rounded text-xs">
                            Overdue
                          </span>
                        )}
                      </p>
                      {nextFollowUp.remarks && (
                        <p className="text-sm text-gray-700">
                          <span className="font-medium text-purple-600">📝 Remarks:</span> {nextFollowUp.remarks}
                        </p>
                      )}
                    </>
                  )}
                  
                  <div className="flex flex-wrap gap-2">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium text-purple-600">📊 Status:</span>{' '}
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        leadWithFollowUps.status === 'new' ? 'bg-blue-500 text-white' :
                        leadWithFollowUps.status === 'open' ? 'bg-green-500 text-white' :
                        'bg-orange-500 text-white'
                      }`}>
                        {formatStatusDisplay(leadWithFollowUps.status)}
                      </span>
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium text-purple-600">✅ Active:</span>{' '}
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        leadWithFollowUps.is_active
                          ? 'bg-green-500 text-white'
                          : 'bg-red-500 text-white'
                      }`}>
                        {leadWithFollowUps.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium text-purple-600">📅 Follow-ups:</span>{' '}
                      <span className="px-2 py-1 rounded text-xs font-bold bg-purple-100 text-purple-800">
                        {upcomingFollowUps.length} upcoming, {pastFollowUps.length} past
                      </span>
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 w-full md:w-auto">
                <button
                  onClick={() => viewFollowUpHistory(leadWithFollowUps)}
                  className="flex-1 md:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition-all hover:scale-105 shadow-md"
                >
                  History 
                </button>
                <button
                  onClick={() => completeFollowUp(nextFollowUp)}
                  disabled={!nextFollowUp}
                  className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-sm transition-all hover:scale-105 shadow-md ${
                    nextFollowUp
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Complete
                </button>
              </div>
            </div>
            
            {/* Show additional follow-ups summary */}
            {leadWithFollowUps.follow_ups.length > 1 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Other follow-ups:</span>{' '}
                  {sortedFollowUps.slice(1).map((f, idx) => (
                    <span key={f.id} className="ml-2">
                      {new Date(f.follow_up_date).toLocaleDateString()}
                      {new Date(f.follow_up_date) < new Date() && ' (past)'}
                      {idx < sortedFollowUps.length - 2 ? ', ' : ''}
                    </span>
                  ))}
                </p>
              </div>
            )}
          </div>
        );
      })}
      {leadsWithFollowUps.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-6xl mb-4">🎉</div>
          <p className="text-xl">No follow-ups scheduled</p>
          <p className="text-gray-500 mt-2">Add follow-ups to active leads</p>
        </div>
      )}
    </div>
  </div>
)}

        {activeTab === 'tasks' && (
          <div className="bg-white rounded-2xl shadow-xl p-4 md:p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-800">Tasks</h2>
              <button
                onClick={() => setIsTaskModalOpen(true)}
                className="bg-gradient-to-r from-orange-600 to-red-600 text-white px-4 md:px-6 py-2 rounded-lg hover:from-orange-700 hover:to-red-700 transition-all hover:scale-105 shadow-md text-sm md:text-base"
              >
                + Add Task
              </button>
            </div>
            <div className="space-y-4">
              {tasks.map((task, index) => (
                <div
                  key={task.id}
                  className={`border-2 rounded-xl p-4 md:p-5 transition-all animate-slideUp ${
                    task.completed
                      ? 'bg-gray-50 border-gray-300'
                      : 'border-orange-200 hover:shadow-lg bg-gradient-to-r from-orange-50 to-red-50'
                  }`}
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="flex items-start space-x-4">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => toggleTaskComplete(task)}
                      className="mt-1 w-5 h-5 md:w-6 md:h-6 text-orange-600 rounded-lg cursor-pointer transition-all"
                    />
                    <div className="flex-1">
                      <h3
                        className={`text-base md:text-lg font-semibold ${
                          task.completed ? 'line-through text-gray-500' : 'text-gray-900'
                        }`}
                      >
                        {task.title}
                      </h3>
                      {task.description && (
                        <p
                          className={`text-sm mt-1 ${
                            task.completed ? 'text-gray-400' : 'text-gray-600'
                          }`}
                        >
                          {task.description}
                        </p>
                      )}
                      <p
                        className={`text-sm mt-2 ${
                          task.completed ? 'text-gray-400' : 'text-gray-600'
                        }`}
                      >
                        <span className="font-medium">📅 Due:</span>{' '}
                        {new Date(task.due_date).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => editTask(task)}
                      className="text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
              {tasks.length === 0 && (
                <div className="text-center py-16 text-gray-400">
                  <div className="text-6xl mb-4">📝</div>
                  <p className="text-xl">No tasks yet</p>
                </div>
              )}
            </div>
          </div>
        )}

        {isLeadModalOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 shadow-2xl animate-scaleIn">
              <h3 className="text-2xl md:text-3xl font-bold mb-6 text-gray-800">
                {editingItem ? 'Edit Lead' : 'Add New Lead'}
              </h3>
              <form onSubmit={addOrUpdateLead} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={leadForm.full_name}
                    onChange={(e) => setLeadForm({ ...leadForm, full_name: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={leadForm.email}
                    onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                    <input
                      type="tel"
                      value={leadForm.phone}
                      onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Company</label>
                    <input
                      type="text"
                      value={leadForm.company}
                      onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Job Title</label>
                    <input
                      type="text"
                      value={leadForm.job_title}
                      onChange={(e) => setLeadForm({ ...leadForm, job_title: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                    <input
                      type="text"
                      value={leadForm.location}
                      onChange={(e) => setLeadForm({ ...leadForm, location: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Source</label>
                    <select
                      value={leadForm.source}
                      onChange={(e) => setLeadForm({ ...leadForm, source: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="Website">Website</option>
                      <option value="Instagram">Instagram</option>
                      <option value="Facebook">Facebook</option>
                      <option value="Cold Call">Cold Call</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                    <select
                      value={leadForm.status}
                      onChange={(e) => setLeadForm({ ...leadForm, status: e.target.value as any })}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="new">New</option>
                      <option value="open">Open</option>
                      <option value="important">Important</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Industry</label>
                  <input
                    type="text"
                    value={leadForm.industry}
                    onChange={(e) => setLeadForm({ ...leadForm, industry: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all font-medium shadow-lg hover:scale-105"
                  >
                    {editingItem ? 'Update Lead' : 'Add Lead'}
                  </button>
                  <button
                    type="button"
                    onClick={resetLeadForm}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300 transition-all font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isFollowUpModalOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 md:p-8 shadow-2xl animate-scaleIn">
              <h3 className="text-2xl md:text-3xl font-bold mb-6 text-gray-800">
                {editingItem ? 'Edit Follow-up' : 'Add Follow-up'}
              </h3>
              <form onSubmit={addOrUpdateFollowUp} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Lead <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={followUpForm.lead_id}
                    onChange={(e) => setFollowUpForm({ ...followUpForm, lead_id: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Follow-up Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    min={getTodayDate()}
                    value={followUpForm.follow_up_date}
                    onChange={(e) => setFollowUpForm({ ...followUpForm, follow_up_date: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Remarks</label>
                  <textarea
                    value={followUpForm.remarks}
                    onChange={(e) => setFollowUpForm({ ...followUpForm, remarks: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    placeholder="e.g., Call Not Pick, Meeting scheduled, etc."
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all font-medium shadow-lg hover:scale-105"
                  >
                    {editingItem ? 'Update Follow-up' : 'Add Follow-up'}
                  </button>
                  <button
                    type="button"
                    onClick={resetFollowUpForm}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300 transition-all font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isTaskModalOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 md:p-8 shadow-2xl animate-scaleIn">
              <h3 className="text-2xl md:text-3xl font-bold mb-6 text-gray-800">
                {editingItem ? 'Edit Task' : 'Add New Task'}
              </h3>
              <form onSubmit={addOrUpdateTask} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={taskForm.title}
                    onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={taskForm.description}
                    onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Due Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    min={getTodayDate()}
                    value={taskForm.due_date}
                    onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-orange-600 to-red-600 text-white py-3 rounded-lg hover:from-orange-700 hover:to-red-700 transition-all font-medium shadow-lg hover:scale-105"
                  >
                    {editingItem ? 'Update Task' : 'Add Task'}
                  </button>
                  <button
                    type="button"
                    onClick={resetTaskForm}
                    className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300 transition-all font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isHistoryModalOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 shadow-2xl animate-scaleIn">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl md:text-3xl font-bold text-gray-800">
                  Follow-up History - {selectedLead?.full_name}
                </h3>
                <button
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 text-3xl"
                >
                  ×
                </button>
              </div>

              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-700 mb-2">
                      <span className="font-semibold">Lead:</span> {selectedLead?.full_name}
                    </p>
                    <p className="text-sm text-gray-700 mb-2">
                      <span className="font-semibold">Email:</span> {selectedLead?.email}
                    </p>
                    <p className="text-sm text-gray-700 mb-2">
                      <span className="font-semibold">Phone:</span> {selectedLead?.phone || 'N/A'}
                    </p>
                  </div>
                  <div>
                    {selectedLead?.company && (
                      <p className="text-sm text-gray-700 mb-2">
                        <span className="font-semibold">Company:</span> {selectedLead.company}
                      </p>
                    )}
                    <p className="text-sm text-gray-700 mb-2">
                      <span className="font-semibold">Status:</span> 
                      <span className={`ml-2 px-3 py-1 rounded-full text-xs font-bold ${
                        selectedLead?.status === 'new' ? 'bg-blue-500 text-white' :
                        selectedLead?.status === 'open' ? 'bg-green-500 text-white' :
                        'bg-orange-500 text-white'
                      }`}>
                        {formatStatusDisplay(selectedLead?.status || '')}
                      </span>
                    </p>
                    <p className="text-sm text-gray-700 mb-2">
                      <span className="font-semibold">Active Status:</span>
                      <span className={`ml-2 px-3 py-1 rounded-full text-xs font-bold ${
                        selectedLead?.is_active
                          ? 'bg-green-500 text-white'
                          : 'bg-red-500 text-white'
                      }`}>
                        {selectedLead?.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {followUpHistory.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-6xl mb-4">📭</div>
                  <p className="text-xl">No follow-up history</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border-2 border-gray-100 mb-6">
                  <table className="w-full">
                    <thead className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold">Date Added</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold">Scheduled For</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold">Remarks</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold">Completed Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {followUpHistory.map((history, index) => (
                        <tr
                          key={history.id}
                          className={`hover:bg-gray-50 transition-all animate-fadeIn ${
                            history.completed ? 'bg-green-50' : 
                            new Date(history.follow_up_date) < new Date() ? 'bg-red-50' : 
                            'bg-yellow-50'
                          }`}
                          style={{ animationDelay: `${index * 0.05}s` }}
                        >
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {new Date(history.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {new Date(history.follow_up_date).toLocaleDateString()}
                            {new Date(history.follow_up_date) < new Date() && !history.completed && (
                              <span className="ml-2 bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-bold">
                                Past Due
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {history.remarks || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-bold ${
                                history.completed
                                  ? 'bg-green-500 text-white'
                                  : new Date(history.follow_up_date) < new Date()
                                  ? 'bg-red-500 text-white'
                                  : 'bg-yellow-500 text-white'
                              }`}
                            >
                              {history.completed ? 'Completed' : 
                               new Date(history.follow_up_date) < new Date() ? 'Past Due' : 'Pending'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {history.completed_at
                              ? new Date(history.completed_at).toLocaleDateString()
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex flex-col md:flex-row gap-4">
                <button
                  onClick={saveHistoryAsPDF}
                  className="flex-1 bg-gradient-to-r from-red-600 to-pink-600 text-white py-3 rounded-lg hover:from-red-700 hover:to-pink-700 transition-all font-medium shadow-lg hover:scale-105 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Save as PDF
                </button>
                <button
                  onClick={() => setIsHistoryModalOpen(false)}
                  className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300 transition-all font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {isImportModalOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 md:p-8 shadow-2xl animate-scaleIn">
              <h3 className="text-2xl md:text-3xl font-bold mb-6 text-gray-800">Import Leads</h3>
              <div className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-500 transition-all">
                  <div className="text-6xl mb-4">📁</div>
                  <p className="text-gray-700 mb-4 font-medium">
                    Upload CSV or Excel file with leads data
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    Format: Full Name, Email, Phone, Company, Job Title, Location, Source, Status, Industry
                  </p>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileImport}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="inline-block bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-lg cursor-pointer hover:from-blue-700 hover:to-indigo-700 transition-all font-medium shadow-lg hover:scale-105"
                  >
                    Choose File
                  </label>
                </div>
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="w-full bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300 transition-all font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

                  <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
            }
            }

        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
            }
            }
            
            .animate-fadeIn {
              animation: fadeIn 0.3s ease-out;
        }
        
        .animate-slideUp {
          animation: slideUp 0.4s ease-out;
        }

        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }

        .animate-scaleIn {
          animation: scaleIn 0.3s ease-out;
        }
        `}</style>
        </div>
  );
}
