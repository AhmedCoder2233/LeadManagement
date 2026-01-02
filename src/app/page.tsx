// app/page.tsx
'use client';

import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import { supabase } from './lib/supabase-client';
import Papa from 'papaparse';
import { format } from 'date-fns';
import { 
  Search, Filter, Download, Upload, Plus, Edit, Trash2, 
  Phone, Mail, Building, Calendar, User, ChevronDown, 
  ChevronUp, CheckCircle, XCircle, AlertCircle, 
  MoreVertical, Eye, RefreshCw, BarChart3, Users, TrendingUp
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

// ==================== TYPES ====================
type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal_sent' | 'converted' | 'lost';
type LeadPriority = 'low' | 'medium' | 'high';
type LeadSource = 'website' | 'referral' | 'social_media' | 'event' | 'cold_call' | 'other';

interface Lead {
  id: string;
  created_at: string;
  updated_at: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  job_title: string;
  source: LeadSource;
  status: LeadStatus;
  priority: LeadPriority;
  lead_score: number;
  estimated_value: number | null;
  industry: string;
  last_contact_date: string | null;
  next_follow_up_date: string | null;
  follow_up_notes: string;
  communication_history: any[];
  tags: string[];
}

interface Stats {
  total: number;
  new: number;
  contacted: number;
  converted: number;
  followups: number;
}

interface Filters {
  search: string;
  status: LeadStatus | 'all';
  priority: LeadPriority | 'all';
  source: LeadSource | 'all';
  assignedTo: string;
  dateRange: {
    start: string | null;
    end: string | null;
  };
}

interface FormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  job_title: string;
  source: LeadSource;
  status: LeadStatus;
  priority: LeadPriority;
  lead_score: number;
  estimated_value: string;
  industry: string;
  last_contact_date: string;
  next_follow_up_date: string;
  follow_up_notes: string;
  tags: string[];
  communication_history: any[];
}

interface SortConfig {
  key: keyof Lead;
  direction: 'asc' | 'desc';
}

// ==================== MAIN COMPONENT ====================
export default function LeadManagementSystem() {
  // State Management
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    new: 0,
    contacted: 0,
    converted: 0,
    followups: 0
  });

  // Filters
  const [filters, setFilters] = useState<Filters>({
    search: '',
    status: 'all',
    priority: 'all',
    source: 'all',
    assignedTo: 'all',
    dateRange: { start: null, end: null }
  });

  // Sort
  const [sortConfig, setSortConfig] = useState<SortConfig>({ 
    key: 'created_at', 
    direction: 'desc' 
  });

  // Form Data
  const [formData, setFormData] = useState<FormData>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    company: '',
    job_title: '',
    source: 'website',
    status: 'new',
    priority: 'medium',
    lead_score: 0,
    estimated_value: '',
    industry: '',
    last_contact_date: '',
    next_follow_up_date: '',
    follow_up_notes: '',
    tags: [],
    communication_history: []
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  // File upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ==================== EFFECTS ====================
  useEffect(() => {
    fetchLeads();
    fetchStats();
    
    // Real-time subscription
    const channel = supabase
      .channel('leads-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'leads' }, 
        () => {
          fetchLeads();
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filter leads when filters change
  useEffect(() => {
    filterLeads();
  }, [filters, leads, sortConfig]);

  // ==================== FUNCTIONS ====================
  
  // Fetch all leads
  const fetchLeads = async (): Promise<void> => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setLeads(data as Lead[] || []);
      setFilteredLeads(data as Lead[] || []);
    } catch (error) {
      toast.error('Error fetching leads');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch statistics
  const fetchStats = async (): Promise<void> => {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    
    const { data: allLeads } = await supabase.from('leads').select('*');
    const { data: newLeads } = await supabase.from('leads').select('*').eq('status', 'new');
    const { data: contacted } = await supabase.from('leads').select('*').eq('status', 'contacted');
    const { data: converted } = await supabase.from('leads').select('*').eq('status', 'converted');
    const { data: followups } = await supabase
      .from('leads')
      .select('*')
      .gte('next_follow_up_date', today)
      .lte('next_follow_up_date', tomorrow);

    setStats({
      total: allLeads?.length || 0,
      new: newLeads?.length || 0,
      contacted: contacted?.length || 0,
      converted: converted?.length || 0,
      followups: followups?.length || 0
    });
  };

  // Helper function for safe string comparison
  const safeToString = (value: any): string => {
    if (value === null || value === undefined) return '';
    return String(value).toLowerCase();
  };

  // Filter leads based on criteria
  const filterLeads = (): void => {
    let filtered = [...leads];

    // Search
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(lead =>
        safeToString(lead.first_name).includes(searchTerm) ||
        safeToString(lead.last_name).includes(searchTerm) ||
        safeToString(lead.email).includes(searchTerm) ||
        safeToString(lead.company).includes(searchTerm) ||
        safeToString(lead.phone).includes(searchTerm)
      );
    }

    // Status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(lead => lead.status === filters.status);
    }

    // Priority filter
    if (filters.priority !== 'all') {
      filtered = filtered.filter(lead => lead.priority === filters.priority);
    }

    // Source filter
    if (filters.source !== 'all') {
      filtered = filtered.filter(lead => lead.source === filters.source);
    }

    // Date range filter
    if (filters.dateRange.start) {
      filtered = filtered.filter(lead => 
        new Date(lead.created_at) >= new Date(filters.dateRange.start!)
      );
    }
    if (filters.dateRange.end) {
      filtered = filtered.filter(lead => 
        new Date(lead.created_at) <= new Date(filters.dateRange.end!)
      );
    }

    // Sorting with null safety
    filtered.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      // Handle null/undefined values
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return sortConfig.direction === 'asc' ? 1 : -1;
      if (bValue == null) return sortConfig.direction === 'asc' ? -1 : 1;
      
      // Both values are not null, now we can compare
      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    setFilteredLeads(filtered);
    setCurrentPage(1);
  };

  // Handle sort
  const requestSort = (key: keyof Lead): void => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Handle form input changes
  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>): void => {
    const { name, value, type } = e.target;
    
    if (type === 'number') {
      setFormData(prev => ({
        ...prev,
        [name]: name === 'lead_score' ? parseInt(value) || 0 : parseFloat(value) || 0
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  // Add/Update lead
  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    
    try {
      const leadData = {
        ...formData,
        estimated_value: formData.estimated_value ? parseFloat(formData.estimated_value) : null,
        updated_at: new Date().toISOString(),
        ...(editingLead ? {} : { created_at: new Date().toISOString() })
      };

      if (editingLead) {
        // Update lead
        const { error } = await supabase
          .from('leads')
          .update(leadData)
          .eq('id', editingLead.id);

        if (error) throw error;
        toast.success('Lead updated successfully');
      } else {
        // Add new lead
        const { error } = await supabase
          .from('leads')
          .insert([leadData]);

        if (error) throw error;
        toast.success('Lead added successfully');
      }

      // Reset form
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        company: '',
        job_title: '',
        source: 'website',
        status: 'new',
        priority: 'medium',
        lead_score: 0,
        estimated_value: '',
        industry: '',
        last_contact_date: '',
        next_follow_up_date: '',
        follow_up_notes: '',
        tags: [],
        communication_history: []
      });
      
      setShowAddForm(false);
      setEditingLead(null);
      fetchLeads();
      fetchStats();
    } catch (error: any) {
      toast.error('Error saving lead');
      console.error(error);
    }
  };

  // Edit lead
  const handleEdit = (lead: Lead): void => {
    setEditingLead(lead);
    setFormData({
      first_name: lead.first_name || '',
      last_name: lead.last_name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      company: lead.company || '',
      job_title: lead.job_title || '',
      source: lead.source || 'website',
      status: lead.status || 'new',
      priority: lead.priority || 'medium',
      lead_score: lead.lead_score || 0,
      estimated_value: lead.estimated_value?.toString() || '',
      industry: lead.industry || '',
      last_contact_date: lead.last_contact_date || '',
      next_follow_up_date: lead.next_follow_up_date || '',
      follow_up_notes: lead.follow_up_notes || '',
      tags: lead.tags || [],
      communication_history: lead.communication_history || []
    });
    setShowAddForm(true);
  };

  // Delete lead
  const handleDelete = async (id: string): Promise<void> => {
    if (!confirm('Are you sure you want to delete this lead?')) return;
    
    try {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      toast.success('Lead deleted successfully');
      fetchLeads();
      fetchStats();
    } catch (error: any) {
      toast.error('Error deleting lead');
    }
  };

  // Export to CSV
  const exportToCSV = (): void => {
    const csvData = filteredLeads.map(lead => ({
      'First Name': lead.first_name,
      'Last Name': lead.last_name,
      'Email': lead.email,
      'Phone': lead.phone || '',
      'Company': lead.company || '',
      'Job Title': lead.job_title || '',
      'Source': lead.source,
      'Status': lead.status,
      'Priority': lead.priority,
      'Lead Score': lead.lead_score.toString(),
      'Estimated Value': lead.estimated_value?.toString() || '',
      'Industry': lead.industry || '',
      'Last Contact': lead.last_contact_date || '',
      'Next Follow-up': lead.next_follow_up_date || '',
      'Created Date': lead.created_at
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `leads_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('CSV exported successfully');
  };

  // Import from CSV
  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: Papa.ParseResult<any>) => {
        const leadsToImport = results.data
          .filter((row: any) => row['Email'] || row['email'])
          .map((row: any) => ({
            first_name: row['First Name'] || row['first_name'] || '',
            last_name: row['Last Name'] || row['last_name'] || '',
            email: row['Email'] || row['email'] || '',
            phone: row['Phone'] || row['phone'] || '',
            company: row['Company'] || row['company'] || '',
            job_title: row['Job Title'] || row['job_title'] || '',
            source: (row['Source'] || row['source'] || 'website') as LeadSource,
            status: (row['Status'] || row['status'] || 'new') as LeadStatus,
            priority: (row['Priority'] || row['priority'] || 'medium') as LeadPriority,
            lead_score: parseInt(row['Lead Score'] || row['lead_score'] || '0'),
            estimated_value: parseFloat(row['Estimated Value'] || row['estimated_value'] || '0') || null,
            industry: row['Industry'] || row['industry'] || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }));

        if (leadsToImport.length === 0) {
          toast.error('No valid leads found in CSV');
          return;
        }

        try {
          const { error } = await supabase
            .from('leads')
            .insert(leadsToImport);

          if (error) throw error;
          
          toast.success(`${leadsToImport.length} leads imported successfully`);
          setShowImportModal(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          fetchLeads();
          fetchStats();
        } catch (error: any) {
          toast.error('Error importing leads: ' + error.message);
        }
      },
      error: (error: any) => {
        toast.error('Error parsing CSV file: ' + error.message);
      }
    });
  };

  // Bulk actions
  const handleBulkDelete = async (): Promise<void> => {
    if (!selectedLeads.length || !confirm(`Delete ${selectedLeads.length} selected leads?`)) return;
    
    try {
      const { error } = await supabase
        .from('leads')
        .delete()
        .in('id', selectedLeads);

      if (error) throw error;
      
      toast.success(`${selectedLeads.length} leads deleted`);
      setSelectedLeads([]);
      fetchLeads();
      fetchStats();
    } catch (error: any) {
      toast.error('Error deleting leads');
    }
  };

  // Update follow-up
  const updateFollowUp = async (leadId: string, notes: string, nextDate: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('leads')
        .update({
          last_contact_date: new Date().toISOString(),
          next_follow_up_date: nextDate,
          follow_up_notes: notes,
          status: 'contacted',
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId);

      if (error) throw error;
      
      toast.success('Follow-up updated');
      fetchLeads();
    } catch (error: any) {
      toast.error('Error updating follow-up');
    }
  };

  // Get status color
  const getStatusColor = (status: LeadStatus): string => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-800';
      case 'contacted': return 'bg-yellow-100 text-yellow-800';
      case 'qualified': return 'bg-purple-100 text-purple-800';
      case 'proposal_sent': return 'bg-indigo-100 text-indigo-800';
      case 'converted': return 'bg-green-100 text-green-800';
      case 'lost': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Get priority color
  const getPriorityColor = (priority: LeadPriority): string => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Safe date formatting
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'Never';
    try {
      return format(new Date(dateString), 'MMM dd, yyyy');
    } catch {
      return 'Invalid date';
    }
  };

  // ==================== PAGINATION ====================
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentLeads = filteredLeads.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredLeads.length / itemsPerPage);

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" />
      
      {/* Header */}
      <div className="bg-white shadow">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Lead Management System</h1>
              <p className="text-gray-600">Manage your leads effectively</p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Upload className="w-4 h-4 mr-2" />
                Import CSV
              </button>
              <button
                onClick={exportToCSV}
                className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </button>
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Lead
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Total Leads</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">New Leads</p>
                <p className="text-2xl font-bold">{stats.new}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-yellow-100 rounded-lg">
                <Phone className="w-6 h-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Contacted</p>
                <p className="text-2xl font-bold">{stats.contacted}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-purple-100 rounded-lg">
                <CheckCircle className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Converted</p>
                <p className="text-2xl font-bold">{stats.converted}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-red-100 rounded-lg">
                <Calendar className="w-6 h-6 text-red-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Follow-ups Today</p>
                <p className="text-2xl font-bold">{stats.followups}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters Section */}
      <div className="px-6 py-4">
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Filters</h2>
            <button
              onClick={() => setFilters({
                search: '',
                status: 'all',
                priority: 'all',
                source: 'all',
                assignedTo: 'all',
                dateRange: { start: null, end: null }
              })}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Clear all
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search leads..."
                  className="w-full pl-10 pr-3 py-2 border rounded-lg"
                  value={filters.search}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => 
                    setFilters({...filters, search: e.target.value})
                  }
                />
              </div>
            </div>
            
            {/* Status */}
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={filters.status}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                  setFilters({...filters, status: e.target.value as LeadStatus | 'all'})
                }
              >
                <option value="all">All Status</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="proposal_sent">Proposal Sent</option>
                <option value="converted">Converted</option>
                <option value="lost">Lost</option>
              </select>
            </div>
            
            {/* Priority */}
            <div>
              <label className="block text-sm font-medium mb-1">Priority</label>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={filters.priority}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                  setFilters({...filters, priority: e.target.value as LeadPriority | 'all'})
                }
              >
                <option value="all">All Priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            
            {/* Source */}
            <div>
              <label className="block text-sm font-medium mb-1">Source</label>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={filters.source}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => 
                  setFilters({...filters, source: e.target.value as LeadSource | 'all'})
                }
              >
                <option value="all">All Sources</option>
                <option value="website">Website</option>
                <option value="referral">Referral</option>
                <option value="social_media">Social Media</option>
                <option value="event">Event</option>
                <option value="cold_call">Cold Call</option>
                <option value="other">Other</option>
              </select>
            </div>
            
            {/* Date Range */}
            <div>
              <label className="block text-sm font-medium mb-1">Date Range</label>
              <div className="flex space-x-2">
                <input
                  type="date"
                  className="w-full border rounded-lg px-3 py-2"
                  value={filters.dateRange.start || ''}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setFilters({
                    ...filters, 
                    dateRange: {...filters.dateRange, start: e.target.value}
                  })}
                />
                <input
                  type="date"
                  className="w-full border rounded-lg px-3 py-2"
                  value={filters.dateRange.end || ''}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setFilters({
                    ...filters, 
                    dateRange: {...filters.dateRange, end: e.target.value}
                  })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedLeads.length > 0 && (
        <div className="px-6 py-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center justify-between">
            <span>{selectedLeads.length} leads selected</span>
            <div className="flex space-x-3">
              <button
                onClick={handleBulkDelete}
                className="flex items-center px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete Selected
              </button>
              <button
                onClick={() => setSelectedLeads([])}
                className="px-3 py-1 border rounded hover:bg-gray-50"
              >
                Clear Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leads Table */}
      <div className="px-6 py-4">
        <div className="bg-white rounded-xl shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Loading leads...</p>
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">No leads found</p>
              <button
                onClick={() => setShowAddForm(true)}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add Your First Lead
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selectedLeads.length === currentLeads.length && currentLeads.length > 0}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            if (e.target.checked) {
                              setSelectedLeads(currentLeads.map(lead => lead.id));
                            } else {
                              setSelectedLeads([]);
                            }
                          }}
                        />
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                        onClick={() => requestSort('first_name')}
                      >
                        <div className="flex items-center">
                          Name
                          {sortConfig.key === 'first_name' && (
                            sortConfig.direction === 'asc' ? 
                              <ChevronUp className="w-4 h-4 ml-1" /> : 
                              <ChevronDown className="w-4 h-4 ml-1" />
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contact
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Company
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                        onClick={() => requestSort('status')}
                      >
                        <div className="flex items-center">
                          Status
                          {sortConfig.key === 'status' && (
                            sortConfig.direction === 'asc' ? 
                              <ChevronUp className="w-4 h-4 ml-1" /> : 
                              <ChevronDown className="w-4 h-4 ml-1" />
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Priority
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Follow-up
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {currentLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={selectedLeads.includes(lead.id)}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => {
                              if (e.target.checked) {
                                setSelectedLeads([...selectedLeads, lead.id]);
                              } else {
                                setSelectedLeads(selectedLeads.filter(id => id !== lead.id));
                              }
                            }}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900">
                              {lead.first_name} {lead.last_name}
                            </p>
                            <p className="text-sm text-gray-500">{lead.job_title}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="flex items-center text-sm">
                              <Mail className="w-4 h-4 mr-2 text-gray-400" />
                              {lead.email}
                            </div>
                            <div className="flex items-center text-sm">
                              <Phone className="w-4 h-4 mr-2 text-gray-400" />
                              {lead.phone || 'Not provided'}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <Building className="w-4 h-4 mr-2 text-gray-400" />
                            <span>{lead.company || 'N/A'}</span>
                          </div>
                          <span className="text-xs text-gray-500">{lead.industry}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(lead.status)}`}>
                            {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
                          </span>
                          <div className="text-xs text-gray-500 mt-1">
                            Score: {lead.lead_score}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(lead.priority)}`}>
                            {lead.priority.charAt(0).toUpperCase() + lead.priority.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {lead.next_follow_up_date ? (
                            <div>
                              <div className="flex items-center text-sm">
                                <Calendar className="w-4 h-4 mr-1 text-blue-500" />
                                {formatDate(lead.next_follow_up_date)}
                              </div>
                              <div className="text-xs text-gray-500">
                                Last: {formatDate(lead.last_contact_date)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">No follow-up</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleEdit(lead)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                              title="Edit"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => updateFollowUp(lead.id, 'Called today', new Date(Date.now() + 86400000).toISOString())}
                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                              title="Mark contacted"
                            >
                              <Phone className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(lead.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-700">
                      Showing <span className="font-medium">{indexOfFirstItem + 1}</span> to{' '}
                      <span className="font-medium">
                        {Math.min(indexOfLastItem, filteredLeads.length)}
                      </span>{' '}
                      of <span className="font-medium">{filteredLeads.length}</span> leads
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 border rounded disabled:opacity-50"
                      >
                        Previous
                      </button>
                      {[...Array(totalPages)].map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setCurrentPage(i + 1)}
                          className={`px-3 py-1 border rounded ${
                            currentPage === i + 1 ? 'bg-blue-600 text-white' : ''
                          }`}
                        >
                          {i + 1}
                        </button>
                      ))}
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 border rounded disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add/Edit Lead Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">
                  {editingLead ? 'Edit Lead' : 'Add New Lead'}
                </h2>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingLead(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              
              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium mb-1">First Name *</label>
                    <input
                      type="text"
                      name="first_name"
                      required
                      className="w-full border rounded-lg px-3 py-2"
                      value={formData.first_name}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Last Name *</label>
                    <input
                      type="text"
                      name="last_name"
                      required
                      className="w-full border rounded-lg px-3 py-2"
                      value={formData.last_name}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Email *</label>
                    <input
                      type="email"
                      name="email"
                      required
                      className="w-full border rounded-lg px-3 py-2"
                      value={formData.email}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      className="w-full border rounded-lg px-3 py-2"
                      value={formData.phone}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Company</label>
                    <input
                      type="text"
                      name="company"
                      className="w-full border rounded-lg px-3 py-2"
                      value={formData.company}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Job Title</label>
                    <input
                      type="text"
                      name="job_title"
                      className="w-full border rounded-lg px-3 py-2"
                      value={formData.job_title}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Source</label>
                    <select
                      name="source"
                      className="w-full border rounded-lg px-3 py-2"
                      value={formData.source}
                      onChange={handleInputChange}
                    >
                      <option value="website">Website</option>
                      <option value="referral">Referral</option>
                      <option value="social_media">Social Media</option>
                      <option value="event">Event</option>
                      <option value="cold_call">Cold Call</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Status</label>
                    <select
                      name="status"
                      className="w-full border rounded-lg px-3 py-2"
                      value={formData.status}
                      onChange={handleInputChange}
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="qualified">Qualified</option>
                      <option value="proposal_sent">Proposal Sent</option>
                      <option value="converted">Converted</option>
                      <option value="lost">Lost</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Priority</label>
                    <select
                      name="priority"
                      className="w-full border rounded-lg px-3 py-2"
                      value={formData.priority}
                      onChange={handleInputChange}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Lead Score</label>
                    <input
                      type="number"
                      name="lead_score"
                      min="0"
                      max="100"
                      className="w-full border rounded-lg px-3 py-2"
                      value={formData.lead_score}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Estimated Value</label>
                    <input
                      type="number"
                      name="estimated_value"
                      step="0.01"
                      className="w-full border rounded-lg px-3 py-2"
                      value={formData.estimated_value}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Industry</label>
                    <input
                      type="text"
                      name="industry"
                      className="w-full border rounded-lg px-3 py-2"
                      value={formData.industry}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Last Contact Date</label>
                    <input
                      type="datetime-local"
                      name="last_contact_date"
                      className="w-full border rounded-lg px-3 py-2"
                      value={formData.last_contact_date}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Next Follow-up</label>
                    <input
                      type="datetime-local"
                      name="next_follow_up_date"
                      className="w-full border rounded-lg px-3 py-2"
                      value={formData.next_follow_up_date}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
                
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-1">Follow-up Notes</label>
                  <textarea
                    rows={3}
                    name="follow_up_notes"
                    className="w-full border rounded-lg px-3 py-2"
                    value={formData.follow_up_notes}
                    onChange={handleInputChange}
                  />
                </div>
                
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setEditingLead(null);
                    }}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    {editingLead ? 'Update Lead' : 'Add Lead'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Import Leads from CSV</h2>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              
              <div className="mb-6">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-2">Drag and drop CSV file or</p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Browse Files
                  </button>
                  <p className="text-xs text-gray-500 mt-4">
                    Supported format: CSV with columns: First Name, Last Name, Email, Phone, Company, Job Title, etc.
                  </p>
                </div>
              </div>
              
              <div className="text-sm text-gray-600 mb-4">
                <p className="font-medium mb-2">CSV Format Requirements:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>First row should contain headers</li>
                  <li>Required columns: First Name, Last Name, Email</li>
                  <li>Optional columns: Phone, Company, Job Title, Source, etc.</li>
                </ul>
              </div>
              
              <div className="flex justify-end">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}