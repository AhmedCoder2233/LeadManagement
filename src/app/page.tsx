'use client';

import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
  status: string;
  is_active?: boolean;
  industry?: string;
  created_at: string;
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
}

interface Task {
  id: string;
  title: string;
  description?: string;
  due_date: string;
  completed: boolean;
  created_at: string;
}

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

interface LeadWithFollowUps extends Lead {
  follow_ups: FollowUp[];
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

  const [leadForm, setLeadForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    company: '',
    job_title: '',
    location: '',
    source: 'Website',
    status: 'Active',
    is_active: true,
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

  useEffect(() => {
    fetchLeads();
    fetchFollowUps();
    fetchTasks();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const fetchLeads = async () => {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setLeads(data);
  };

  const fetchFollowUps = async () => {
    const { data: followUpsData, error: followUpsError } = await supabase
      .from('follow_ups')
      .select('*, leads!inner(full_name, email)')
      .eq('completed', false)
      .order('follow_up_date', { ascending: true }); // Changed to ascending for nearest date first

    if (!followUpsError && followUpsData) {
      setFollowUps(followUpsData);

      // Group follow-ups by lead
      const leadsWithFollowUpsData: LeadWithFollowUps[] = [];
      
      // Get all unique leads from follow-ups
      const uniqueLeadIds = Array.from(new Set(followUpsData.map(f => f.lead_id)));
      
      for (const leadId of uniqueLeadIds) {
        const leadData = await supabase
          .from('leads')
          .select('*')
          .eq('id', leadId)
          .single();
        
        if (leadData.data) {
          const leadFollowUps = followUpsData.filter(f => f.lead_id === leadId);
          leadsWithFollowUpsData.push({
            ...leadData.data,
            follow_ups: leadFollowUps.sort((a, b) => 
              new Date(a.follow_up_date).getTime() - new Date(b.follow_up_date).getTime()
            )
          });
        }
      }
      
      setLeadsWithFollowUps(leadsWithFollowUpsData);
    }
  };

  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('due_date', { ascending: false });
    if (!error && data) setTasks(data);
  };

  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const addOrUpdateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      const { error } = await supabase
        .from('leads')
        .update({ ...leadForm, updated_at: new Date().toISOString() })
        .eq('id', editingItem.id);
      if (!error) {
        fetchLeads();
        resetLeadForm();
        showToast('Lead updated successfully!', 'success');
      } else {
        showToast('Failed to update lead', 'error');
      }
    } else {
      const { error } = await supabase.from('leads').insert([leadForm]);
      if (!error) {
        fetchLeads();
        resetLeadForm();
        showToast('Lead added successfully!', 'success');
      } else {
        showToast('Failed to add lead', 'error');
      }
    }
  };

  const addOrUpdateFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (new Date(followUpForm.follow_up_date) < new Date(getTodayDate())) {
      showToast('Follow-up date cannot be in the past!', 'error');
      return;
    }
    if (editingItem) {
      const { error } = await supabase
        .from('follow_ups')
        .update(followUpForm)
        .eq('id', editingItem.id);
      if (!error) {
        fetchFollowUps();
        resetFollowUpForm();
        showToast('Follow-up updated successfully!', 'success');
      } else {
        showToast('Failed to update follow-up', 'error');
      }
    } else {
      const { error } = await supabase.from('follow_ups').insert([followUpForm]);
      if (!error) {
        fetchFollowUps();
        resetFollowUpForm();
        showToast('Follow-up scheduled successfully!', 'success');
      } else {
        showToast('Failed to schedule follow-up', 'error');
      }
    }
  };

  const addOrUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (new Date(taskForm.due_date) < new Date(getTodayDate())) {
      showToast('Task due date cannot be in the past!', 'error');
      return;
    }
    if (editingItem) {
      const { error } = await supabase
        .from('tasks')
        .update({ ...taskForm, updated_at: new Date().toISOString() })
        .eq('id', editingItem.id);
      if (!error) {
        fetchTasks();
        resetTaskForm();
        showToast('Task updated successfully!', 'success');
      } else {
        showToast('Failed to update task', 'error');
      }
    } else {
      const { error } = await supabase.from('tasks').insert([taskForm]);
      if (!error) {
        fetchTasks();
        resetTaskForm();
        showToast('Task created successfully!', 'success');
      } else {
        showToast('Failed to create task', 'error');
      }
    }
  };

  const toggleLeadStatus = async (lead: Lead) => {
    const newStatus = lead.status === 'Active' ? 'Inactive' : 'Active';
    const { error } = await supabase
      .from('leads')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', lead.id);
    if (!error) {
      fetchLeads();
      showToast(`Lead marked as ${newStatus}`, 'success');
    } else {
      showToast('Failed to update lead status', 'error');
    }
  };

  const toggleLeadActiveStatus = async (lead: Lead) => {
    const newActiveStatus = !lead.is_active;
    const { error } = await supabase
      .from('leads')
      .update({ is_active: newActiveStatus, updated_at: new Date().toISOString() })
      .eq('id', lead.id);
    if (!error) {
      fetchLeads();
      showToast(`Lead ${newActiveStatus ? 'activated' : 'deactivated'} successfully!`, 'success');
    } else {
      showToast('Failed to update lead status', 'error');
    }
  };

  const toggleTaskComplete = async (task: Task) => {
    const { error } = await supabase
      .from('tasks')
      .update({ completed: !task.completed })
      .eq('id', task.id);
    if (!error) {
      fetchTasks();
      showToast(task.completed ? 'Task marked as incomplete' : 'Task completed!', 'success');
    } else {
      showToast('Failed to update task', 'error');
    }
  };

  const completeFollowUp = async (followUp: FollowUp) => {
    const { error } = await supabase
      .from('follow_ups')
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq('id', followUp.id);
    if (!error) {
      fetchFollowUps();
      showToast('Follow-up marked as completed!', 'success');
    } else {
      showToast('Failed to complete follow-up', 'error');
    }
  };

  const viewFollowUpHistory = async (lead: Lead) => {
    setSelectedLead(lead);
    const { data, error } = await supabase
      .from('follow_ups')
      .select('*')
      .eq('lead_id', lead.id)
      .order('follow_up_date', { ascending: false });
    if (!error && data) {
      setFollowUpHistory(data);
      setIsHistoryModalOpen(true);
    }
  };

  const exportHistoryToPDF = () => {
    if (!selectedLead || followUpHistory.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Follow-up History - ${selectedLead.full_name}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; }
          h1 { color: #1f2937; border-bottom: 3px solid #8b5cf6; padding-bottom: 10px; }
          .info { margin: 20px 0; color: #4b5563; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background-color: #8b5cf6; color: white; padding: 12px; text-align: left; }
          td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
          tr:nth-child(even) { background-color: #f9fafb; }
          .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
          .completed { background-color: #10b981; color: white; }
          .pending { background-color: #f59e0b; color: white; }
        </style>
      </head>
      <body>
        <h1>Follow-up History</h1>
        <div class="info">
          <strong>Lead Name:</strong> ${selectedLead.full_name}<br>
          <strong>Email:</strong> ${selectedLead.email}<br>
          <strong>Company:</strong> ${selectedLead.company || 'N/A'}<br>
          <strong>Report Generated:</strong> ${new Date().toLocaleString()}
        </div>
        <table>
          <thead>
            <tr>
              <th>Date Added</th>
              <th>Follow-up Date</th>
              <th>Remarks</th>
              <th>Status</th>
              <th>Completed Date</th>
            </tr>
          </thead>
          <tbody>
            ${followUpHistory.map(h => `
              <tr>
                <td>${new Date(h.created_at).toLocaleDateString()}</td>
                <td>${new Date(h.follow_up_date).toLocaleDateString()}</td>
                <td>${h.remarks || '-'}</td>
                <td><span class="status ${h.completed ? 'completed' : 'pending'}">${h.completed ? 'Completed' : 'Pending'}</span></td>
                <td>${h.completed_at ? new Date(h.completed_at).toLocaleDateString() : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
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
      console.error('PDF generation error:', error);
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
      status: 'Active',
      is_active: true,
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
      is_active: lead.is_active || true,
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
      lead.status,
      lead.is_active ? 'Yes' : 'No',
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
      lead.status,
      lead.is_active ? 'Yes' : 'No',
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
            status: values[7] || 'Active',
            is_active: values[8]?.toLowerCase() === 'yes' || true,
            industry: values[9] || ''
          };
          importedLeads.push(lead);
        }
      }

      if (importedLeads.length > 0) {
        const { error } = await supabase.from('leads').insert(importedLeads);
        if (!error) {
          showToast(`Successfully imported ${importedLeads.length} leads!`, 'success');
          fetchLeads();
          setIsImportModalOpen(false);
        } else {
          showToast('Error importing leads. Please check the file format.', 'error');
        }
      }
    };
    reader.readAsText(file);
  };

  const filteredLeads = getFilteredAndSortedLeads();
  const activeLeads = filteredLeads.filter(lead => lead.status === 'Active');

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
        <div className="mb-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-2">
            Lead Management System
          </h1>
          <p className="text-gray-600">Streamline your lead tracking and follow-ups</p>
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
                          onChange={() => toggleLeadStatus(lead)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                            lead.status === 'Active'
                              ? 'bg-green-500 text-white'
                              : 'bg-gray-400 text-white'
                          }`}
                        >
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          onClick={() => toggleLeadActiveStatus(lead)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                            lead.is_active
                              ? 'bg-green-500 text-white hover:bg-green-600'
                              : 'bg-red-500 text-white hover:bg-red-600'
                          }`}
                        >
                          {lead.is_active ? 'Yes' : 'No'}
                        </button>
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
            </div>
            <div className="grid gap-4">
              {leadsWithFollowUps.map((leadWithFollowUps, index) => {
                const latestFollowUp = leadWithFollowUps.follow_ups[0];
                return (
                  <div
                    key={leadWithFollowUps.id}
                    className="border-2 border-purple-200 rounded-xl p-4 md:p-5 hover:shadow-lg transition-all bg-gradient-to-r from-purple-50 to-pink-50 animate-slideUp"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                      <div className="flex-1 w-full">
                        <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-2">
                          {leadWithFollowUps.full_name}
                        </h3>
                        <div className="space-y-2">
                          <p className="text-sm text-gray-700">
                            <span className="font-medium text-purple-600">📧 Email:</span>{' '}
                            {leadWithFollowUps.email}
                          </p>
                          <p className="text-sm text-gray-700">
                            <span className="font-medium text-purple-600">📅 Next Follow-up:</span>{' '}
                            {new Date(latestFollowUp.follow_up_date).toLocaleDateString()}
                            {leadWithFollowUps.follow_ups.length > 1 && (
                              <span className="ml-2 bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">
                                +{leadWithFollowUps.follow_ups.length - 1} more
                              </span>
                            )}
                          </p>
                          {latestFollowUp.remarks && (
                            <p className="text-sm text-gray-700">
                              <span className="font-medium text-purple-600">📝 Remarks:</span> {latestFollowUp.remarks}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 w-full md:w-auto">
                        <button
                          onClick={() => {
                            setFollowUpForm({ 
                              ...followUpForm, 
                              lead_id: leadWithFollowUps.id,
                              follow_up_date: getTodayDate()
                            });
                            setIsFollowUpModalOpen(true);
                          }}
                          className="flex-1 md:flex-none bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm transition-all hover:scale-105 shadow-md"
                        >
                          Add New
                        </button>
                        <button
                          onClick={() => viewFollowUpHistory(leadWithFollowUps)}
                          className="flex-1 md:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition-all hover:scale-105 shadow-md"
                        >
                          History ({leadWithFollowUps.follow_ups.length})
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {leadsWithFollowUps.length === 0 && (
                <div className="text-center py-16 text-gray-400">
                  <div className="text-6xl mb-4">🎉</div>
                  <p className="text-xl">No upcoming follow-ups</p>
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
                      onChange={(e) => setLeadForm({ ...leadForm, status: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Is Active</label>
                    <select
                      value={leadForm.is_active ? 'true' : 'false'}
                      onChange={(e) => setLeadForm({ ...leadForm, is_active: e.target.value === 'true' })}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
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
                    {leads.filter(l => l.status === 'Active' && l.is_active).map((lead) => (
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
                        selectedLead?.status === 'Active' 
                          ? 'bg-green-500 text-white' 
                          : 'bg-gray-400 text-white'
                      }`}>
                        {selectedLead?.status}
                      </span>
                    </p>
                    <p className="text-sm text-gray-700 mb-2">
                      <span className="font-semibold">Report Generated:</span> {new Date().toLocaleString()}
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
                        <th className="px-4 py-3 text-left text-sm font-semibold">Completed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {followUpHistory.map((history, index) => (
                        <tr
                          key={history.id}
                          className={`hover:bg-gray-50 transition-all animate-fadeIn ${
                            history.completed ? 'bg-green-50' : ''
                          }`}
                          style={{ animationDelay: `${index * 0.05}s` }}
                        >
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {new Date(history.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {new Date(history.follow_up_date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {history.remarks || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-bold ${
                                history.completed
                                  ? 'bg-green-500 text-white'
                                  : 'bg-yellow-500 text-white'
                              }`}
                            >
                              {history.completed ? 'Completed' : 'Pending'}
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
                  onClick={exportHistoryToPDF}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all font-medium shadow-lg hover:scale-105 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
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
                    Format: Full Name, Email, Phone, Company, Job Title, Location, Source, Status, Is Active (Yes/No), Industry
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
