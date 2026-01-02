// app/page.tsx
'use client';

import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import { supabase } from './lib/supabase-client';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { 
  Search, Filter, Download, Upload, Plus, Edit, Trash2, 
  Phone, Mail, Building, Calendar, User, ChevronDown, 
  ChevronUp, CheckCircle, XCircle, AlertCircle, UserPlus,
  Menu, X, MoreVertical, Eye, RefreshCw, BarChart3, Users, TrendingUp,
  Clock, Bell, FileText, FileSpreadsheet, Star, Circle, PhoneCall
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

// ==================== TYPES ====================
type LeadStatus = 'new' | 'open' | 'important';
type LeadSource = 'website' | 'referral' | 'social_media' | 'event' | 'cold_call' | 'other';

interface Lead {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  job_title: string;
  source: LeadSource;
  status: LeadStatus;
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
  open: number;
  important: number;
  followups: number;
  dueNow: number;
}

interface Filters {
  search: string;
  status: LeadStatus | 'all';
  source: LeadSource | 'all';
  dateRange: {
    start: string | null;
    end: string | null;
  };
}

interface FormData {
  name: string;
  email: string;
  phone: string;
  company: string;
  job_title: string;
  source: LeadSource;
  status: LeadStatus;
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
  const [showReminderModal, setShowReminderModal] = useState<boolean>(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [selectedLeadForReminder, setSelectedLeadForReminder] = useState<Lead | null>(null);
  const [reminderDateTime, setReminderDateTime] = useState<string>('');
  const [reminderNotes, setReminderNotes] = useState<string>('');
  const [importType, setImportType] = useState<'csv' | 'excel'>('csv');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  
  const [stats, setStats] = useState<Stats>({
    total: 0,
    new: 0,
    open: 0,
    important: 0,
    followups: 0,
    dueNow: 0
  });

  // Filters
  const [filters, setFilters] = useState<Filters>({
    search: '',
    status: 'all',
    source: 'all',
    dateRange: { start: null, end: null }
  });

  // Sort
  const [sortConfig, setSortConfig] = useState<SortConfig>({ 
    key: 'created_at', 
    direction: 'desc' 
  });

  // Form Data
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    company: '',
    job_title: '',
    source: 'website',
    status: 'new',
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
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const tomorrow = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
      
      const { data: allLeads } = await supabase.from('leads').select('*');
      const { data: newLeads } = await supabase.from('leads').select('*').eq('status', 'new');
      const { data: openLeads } = await supabase.from('leads').select('*').eq('status', 'open');
      const { data: importantLeads } = await supabase.from('leads').select('*').eq('status', 'important');
      const { data: followups } = await supabase
        .from('leads')
        .select('*')
        .gte('next_follow_up_date', today)
        .lte('next_follow_up_date', tomorrow);

      // Calculate due now follow-ups
      const dueNow = allLeads?.filter(lead => 
        lead.next_follow_up_date && 
        new Date(lead.next_follow_up_date) <= now
      ).length || 0;

      setStats({
        total: allLeads?.length || 0,
        new: newLeads?.length || 0,
        open: openLeads?.length || 0,
        important: importantLeads?.length || 0,
        followups: followups?.length || 0,
        dueNow
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
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
        safeToString(lead.name).includes(searchTerm) ||
        safeToString(lead.email).includes(searchTerm) ||
        safeToString(lead.company).includes(searchTerm) ||
        safeToString(lead.phone).includes(searchTerm) ||
        safeToString(lead.job_title).includes(searchTerm)
      );
    }

    // Status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(lead => lead.status === filters.status);
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
      
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return sortConfig.direction === 'asc' ? 1 : -1;
      if (bValue == null) return sortConfig.direction === 'asc' ? -1 : 1;
      
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
    const { name, value, type } = e.target as HTMLInputElement;
    
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Helper function to handle empty date strings
  const formatDateForDB = (dateString: string): string | null => {
    if (!dateString || dateString.trim() === '') {
      return null;
    }
    return dateString;
  };

  // Add/Update lead
  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    
    try {
      const leadData = {
        ...formData,
        // Convert empty date strings to null
        last_contact_date: formatDateForDB(formData.last_contact_date),
        next_follow_up_date: formatDateForDB(formData.next_follow_up_date),
        updated_at: new Date().toISOString(),
        ...(editingLead ? {} : { created_at: new Date().toISOString() })
      };

      if (editingLead) {
        // Update lead
        const { error } = await supabase
          .from('leads')
          .update(leadData)
          .eq('id', editingLead.id);

        if (error) {
          console.error('Supabase error:', error);
          throw error;
        }
        toast.success('Lead updated successfully');
      } else {
        // Add new lead
        const { error } = await supabase
          .from('leads')
          .insert([leadData]);

        if (error) {
          console.error('Supabase error:', error);
          throw error;
        }
        toast.success('Lead added successfully');
      }

      // Reset form
      setFormData({
        name: '',
        email: '',
        phone: '',
        company: '',
        job_title: '',
        source: 'website',
        status: 'new',
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
      console.error('Full error:', error);
      toast.error(`Error saving lead: ${error.message || 'Unknown error'}`);
    }
  };

  // Edit lead
  const handleEdit = (lead: Lead): void => {
    setEditingLead(lead);
    setFormData({
      name: lead.name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      company: lead.company || '',
      job_title: lead.job_title || '',
      source: lead.source || 'website',
      status: lead.status || 'new',
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

  // =============== STATUS UPDATE FUNCTIONS ===============
  
  // Mark as Open
  const markAsOpen = async (leadId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('leads')
        .update({
          status: 'open',
          last_contact_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId);

      if (error) throw error;
      
      toast.success('Lead marked as open');
      fetchLeads();
      fetchStats();
    } catch (error: any) {
      toast.error('Error updating lead status');
    }
  };

  // Mark as Important
  const markAsImportant = async (leadId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('leads')
        .update({
          status: 'important',
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId);

      if (error) throw error;
      
      toast.success('Lead marked as important! ⭐');
      fetchLeads();
      fetchStats();
    } catch (error: any) {
      toast.error('Error updating lead status');
    }
  };

  // Mark as New
  const markAsNew = async (leadId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('leads')
        .update({
          status: 'new',
          updated_at: new Date().toISOString()
        })
        .eq('id', leadId);

      if (error) throw error;
      
      toast.success('Lead marked as new');
      fetchLeads();
      fetchStats();
    } catch (error: any) {
      toast.error('Error updating lead status');
    }
  };

  // Update follow-up with custom date
  const updateFollowUp = async (leadId: string, notes: string, nextDate: string): Promise<void> => {
    try {
      const updateData: any = {
        follow_up_notes: notes,
        status: 'open',
        updated_at: new Date().toISOString()
      };

      // Only update dates if provided
      if (nextDate) {
        updateData.next_follow_up_date = nextDate;
        updateData.last_contact_date = new Date().toISOString();
      }

      const { error } = await supabase
        .from('leads')
        .update(updateData)
        .eq('id', leadId);

      if (error) throw error;
      
      toast.success('Follow-up updated');
      fetchLeads();
    } catch (error: any) {
      toast.error('Error updating follow-up');
    }
  };

  // Schedule a reminder
  const scheduleReminder = async (): Promise<void> => {
    if (!selectedLeadForReminder) {
      toast.error('Please select a lead');
      return;
    }

    try {
      await updateFollowUp(
        selectedLeadForReminder.id,
        reminderNotes || 'Scheduled follow-up',
        reminderDateTime || ''
      );

      toast.success('Reminder scheduled');
      
      setShowReminderModal(false);
      setSelectedLeadForReminder(null);
      setReminderDateTime('');
      setReminderNotes('');
    } catch (error) {
      toast.error('Failed to schedule reminder');
    }
  };

  // Export to CSV
  const exportToCSV = (): void => {
    const csvData = filteredLeads.map(lead => ({
      'Name': lead.name,
      'Email': lead.email,
      'Phone': lead.phone || '',
      'Company': lead.company || '',
      'Job Title': lead.job_title || '',
      'Source': lead.source,
      'Status': lead.status,
      'Industry': lead.industry || '',
      'Last Contact': lead.last_contact_date || '',
      'Next Follow-up': lead.next_follow_up_date || '',
      'Follow-up Notes': lead.follow_up_notes || '',
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

  // Export to Excel
  const exportToExcel = (): void => {
    const excelData = filteredLeads.map(lead => ({
      'Name': lead.name,
      'Email': lead.email,
      'Phone': lead.phone || '',
      'Company': lead.company || '',
      'Job Title': lead.job_title || '',
      'Source': lead.source,
      'Status': lead.status,
      'Industry': lead.industry || '',
      'Last Contact': lead.last_contact_date || '',
      'Next Follow-up': lead.next_follow_up_date || '',
      'Follow-up Notes': lead.follow_up_notes || '',
      'Created Date': lead.created_at
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    XLSX.writeFile(wb, `leads_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    toast.success('Excel exported successfully');
  };

  // Import from CSV
  const handleCSVImport = (file: File): void => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: Papa.ParseResult<any>) => {
        const leadsToImport = results.data
          .filter((row: any) => row['Email'] || row['email'] || row['Name'] || row['name'])
          .map((row: any) => ({
            name: row['Name'] || row['name'] || '',
            email: row['Email'] || row['email'] || '',
            phone: row['Phone'] || row['phone'] || '',
            company: row['Company'] || row['company'] || '',
            job_title: row['Job Title'] || row['job_title'] || '',
            source: (row['Source'] || row['source'] || 'website') as LeadSource,
            status: (row['Status'] || row['status'] || 'new') as LeadStatus,
            industry: row['Industry'] || row['industry'] || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }));

        await importLeads(leadsToImport);
      },
      error: (error: any) => {
        toast.error('Error parsing CSV file: ' + error.message);
      }
    });
  };

  // Import from Excel
  const handleExcelImport = (file: File): void => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      const data = e.target?.result;
      const workbook = XLSX.read(data, { type: 'binary' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      const leadsToImport = jsonData
        .filter((row: any) => row['Email'] || row['email'] || row['Name'] || row['name'])
        .map((row: any) => ({
          name: row['Name'] || row['name'] || '',
          email: row['Email'] || row['email'] || '',
          phone: row['Phone'] || row['phone'] || '',
          company: row['Company'] || row['company'] || '',
          job_title: row['Job Title'] || row['job_title'] || '',
          source: (row['Source'] || row['source'] || 'website') as LeadSource,
          status: (row['Status'] || row['status'] || 'new') as LeadStatus,
          industry: row['Industry'] || row['industry'] || '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));

      await importLeads(leadsToImport);
    };
    
    reader.readAsBinaryString(file);
  };

  // Import leads to database
  const importLeads = async (leadsToImport: any[]): Promise<void> => {
    if (leadsToImport.length === 0) {
      toast.error('No valid leads found in file');
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
  };

  // Handle file upload
  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (importType === 'csv') {
      handleCSVImport(file);
    } else {
      handleExcelImport(file);
    }
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

  // Get status color
  const getStatusColor = (status: LeadStatus): string => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-800';
      case 'open': return 'bg-yellow-100 text-yellow-800';
      case 'important': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Get status icon
  const getStatusIcon = (status: LeadStatus): JSX.Element => {
    switch (status) {
      case 'new': return <Circle className="w-3 h-3 mr-1" />;
      case 'open': return <CheckCircle className="w-3 h-3 mr-1" />;
      case 'important': return <Star className="w-3 h-3 mr-1" />;
      default: return <Circle className="w-3 h-3 mr-1" />;
    }
  };

  // Safe date formatting with time
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
      
      if (hasTime) {
        return format(date, 'MMM dd, yyyy HH:mm');
      } else {
        return format(date, 'MMM dd, yyyy');
      }
    } catch {
      return 'Invalid date';
    }
  };

  // Check if follow-up is due
  const isFollowUpDue = (followUpDate: string | null): boolean => {
    if (!followUpDate) return false;
    return new Date(followUpDate) <= new Date();
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
      
      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="lg:hidden fixed top-4 right-4 z-50 p-2 bg-white rounded-lg shadow-md"
      >
        {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Header */}
      <div className="bg-white shadow">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Lead Management System</h1>
              <p className="text-sm sm:text-base text-gray-600">Manage your leads effectively</p>
            </div>
            <div className={`flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 w-full sm:w-auto ${mobileMenuOpen ? 'block' : 'hidden'} lg:flex`}>
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <Upload className="w-4 h-4 mr-2" />
                <span className="text-sm">Import Data</span>
              </button>
              <div className="relative group">
                <button
                  onClick={exportToCSV}
                  className="flex items-center justify-center w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <Download className="w-4 h-4 mr-2" />
                  <span className="text-sm">Export</span>
                </button>
                <div className="absolute right-0 mt-1 w-48 bg-white border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                  <button
                    onClick={exportToCSV}
                    className="flex items-center w-full px-4 py-2 text-sm hover:bg-gray-50"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Export as CSV
                  </button>
                  <button
                    onClick={exportToExcel}
                    className="flex items-center w-full px-4 py-2 text-sm hover:bg-gray-50"
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export as Excel
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                <span className="text-sm">Add Lead</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-4 sm:px-6 py-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="bg-white rounded-xl shadow p-4 sm:p-6">
            <div className="flex items-center">
              <div className="p-2 sm:p-3 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
              </div>
              <div className="ml-3 sm:ml-4">
                <p className="text-xs sm:text-sm text-gray-600">Total Leads</p>
                <p className="text-xl sm:text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow p-4 sm:p-6">
            <div className="flex items-center">
              <div className="p-2 sm:p-3 bg-green-100 rounded-lg">
                <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
              </div>
              <div className="ml-3 sm:ml-4">
                <p className="text-xs sm:text-sm text-gray-600">New Leads</p>
                <p className="text-xl sm:text-2xl font-bold">{stats.new}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow p-4 sm:p-6">
            <div className="flex items-center">
              <div className="p-2 sm:p-3 bg-yellow-100 rounded-lg">
                <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-600" />
              </div>
              <div className="ml-3 sm:ml-4">
                <p className="text-xs sm:text-sm text-gray-600">Open</p>
                <p className="text-xl sm:text-2xl font-bold">{stats.open}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow p-4 sm:p-6">
            <div className="flex items-center">
              <div className="p-2 sm:p-3 bg-purple-100 rounded-lg">
                <Star className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
              </div>
              <div className="ml-3 sm:ml-4">
                <p className="text-xs sm:text-sm text-gray-600">Important</p>
                <p className="text-xl sm:text-2xl font-bold">{stats.important}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow p-4 sm:p-6">
            <div className="flex items-center">
              <div className="p-2 sm:p-3 bg-indigo-100 rounded-lg">
                <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
              </div>
              <div className="ml-3 sm:ml-4">
                <p className="text-xs sm:text-sm text-gray-600">Upcoming</p>
                <p className="text-xl sm:text-2xl font-bold">{stats.followups}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow p-4 sm:p-6">
            <div className="flex items-center">
              <div className="p-2 sm:p-3 bg-red-100 rounded-lg">
                <Bell className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
              </div>
              <div className="ml-3 sm:ml-4">
                <p className="text-xs sm:text-sm text-gray-600">Due Now</p>
                <p className="text-xl sm:text-2xl font-bold">{stats.dueNow}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters Section */}
      <div className="px-4 sm:px-6 py-4">
        <div className="bg-white rounded-xl shadow p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 space-y-2 sm:space-y-0">
            <h2 className="text-lg font-semibold">Filters</h2>
            <button
              onClick={() => setFilters({
                search: '',
                status: 'all',
                source: 'all',
                dateRange: { start: null, end: null }
              })}
              className="text-sm text-gray-600 hover:text-gray-900 self-start sm:self-auto"
            >
              Clear all
            </button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div className="sm:col-span-2 lg:col-span-1">
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
                <option value="open">Open</option>
                <option value="important">Important</option>
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
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-sm font-medium mb-1">Date Range</label>
              <div className="flex space-x-2">
                <input
                  type="date"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={filters.dateRange.start || ''}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setFilters({
                    ...filters, 
                    dateRange: {...filters.dateRange, start: e.target.value}
                  })}
                />
                <input
                  type="date"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
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
        <div className="px-4 sm:px-6 py-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-3 sm:space-y-0">
            <span className="text-sm">{selectedLeads.length} leads selected</span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleBulkDelete}
                className="flex items-center px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete Selected
              </button>
              <button
                onClick={() => setSelectedLeads([])}
                className="px-3 py-1 border rounded hover:bg-gray-50 text-sm"
              >
                Clear Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leads Table */}
      <div className="px-4 sm:px-6 py-4">
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
                      <th className="px-4 py-3">
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
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                        onClick={() => requestSort('name')}
                      >
                        <div className="flex items-center">
                          Name
                          {sortConfig.key === 'name' && (
                            sortConfig.direction === 'asc' ? 
                              <ChevronUp className="w-4 h-4 ml-1" /> : 
                              <ChevronDown className="w-4 h-4 ml-1" />
                          )}
                        </div>
                      </th>
                      <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contact
                      </th>
                      <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Company
                      </th>
                      <th 
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
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
                      <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Source
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Follow-up
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {currentLeads.map((lead) => (
                      <tr key={lead.id} className={`hover:bg-gray-50 ${isFollowUpDue(lead.next_follow_up_date) ? 'bg-red-50' : ''}`}>
                        <td className="px-4 py-4">
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
                        <td className="px-4 py-4">
                          <div>
                            <p className="font-medium text-gray-900 text-sm">
                              {lead.name}
                            </p>
                            <p className="text-xs text-gray-500">{lead.job_title}</p>
                          </div>
                        </td>
                        <td className="hidden md:table-cell px-4 py-4">
                          <div className="space-y-1">
                            <div className="flex items-center text-xs">
                              <Mail className="w-3 h-3 mr-2 text-gray-400" />
                              <span className="truncate max-w-[150px]">{lead.email}</span>
                            </div>
                            <div className="flex items-center text-xs">
                              <Phone className="w-3 h-3 mr-2 text-gray-400" />
                              {lead.phone || 'Not provided'}
                            </div>
                          </div>
                        </td>
                        <td className="hidden lg:table-cell px-4 py-4">
                          <div className="flex items-center">
                            <Building className="w-3 h-3 mr-2 text-gray-400" />
                            <span className="truncate max-w-[120px]">{lead.company || 'N/A'}</span>
                          </div>
                          <span className="text-xs text-gray-500 truncate block max-w-[120px]">{lead.industry}</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(lead.status)}`}>
                            {getStatusIcon(lead.status)}
                            <span className="hidden sm:inline ml-1">{lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}</span>
                          </span>
                        </td>
                        <td className="hidden lg:table-cell px-4 py-4">
                          <span className="text-xs text-gray-600">
                            {lead.source.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {lead.next_follow_up_date ? (
                            <div>
                              <div className={`flex items-center text-xs ${isFollowUpDue(lead.next_follow_up_date) ? 'text-red-600 font-semibold' : ''}`}>
                                <Calendar className="w-3 h-3 mr-1" />
                                <span className="truncate max-w-[120px]">{formatDate(lead.next_follow_up_date)}</span>
                                {isFollowUpDue(lead.next_follow_up_date) && (
                                  <span className="ml-1 px-1 py-0.5 text-[10px] bg-red-100 text-red-800 rounded">DUE</span>
                                )}
                              </div>
                              <div className="text-[10px] text-gray-500 mt-1 hidden sm:block">
                                Last: {formatDate(lead.last_contact_date)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">No follow-up</span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1">
                            {/* Status Change Buttons - Mobile optimized */}
                            <div className="flex gap-1 mb-1">
                              {lead.status !== 'open' && (
                                <button
                                  onClick={() => markAsOpen(lead.id)}
                                  className="p-1 bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200"
                                  title="Mark as Open"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                              
                              {lead.status !== 'important' && (
                                <button
                                  onClick={() => markAsImportant(lead.id)}
                                  className="p-1 bg-purple-100 text-purple-800 rounded hover:bg-purple-200"
                                  title="Mark as Important"
                                >
                                  <Star className="w-3.5 h-3.5" />
                                </button>
                              )}
                              
                              {lead.status !== 'new' && (
                                <button
                                  onClick={() => markAsNew(lead.id)}
                                  className="p-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                                  title="Mark as New"
                                >
                                  <Circle className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            
                            <div className="flex gap-1">
                              {/* Reminder Button */}
                              <button
                                onClick={() => {
                                  setSelectedLeadForReminder(lead);
                                  setReminderDateTime(lead.next_follow_up_date || '');
                                  setReminderNotes(lead.follow_up_notes || '');
                                  setShowReminderModal(true);
                                }}
                                className="p-1 bg-indigo-100 text-indigo-800 rounded hover:bg-indigo-200"
                                title="Schedule Reminder"
                              >
                                <Bell className="w-3.5 h-3.5" />
                              </button>
                              
                              {/* Edit Button */}
                              <button
                                onClick={() => handleEdit(lead)}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                title="Edit"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              
                              {/* Delete Button */}
                              <button
                                onClick={() => handleDelete(lead.id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-4 sm:px-6 py-4 border-t border-gray-200">
                  <div className="flex flex-col sm:flex-row items-center justify-between space-y-3 sm:space-y-0">
                    <div className="text-sm text-gray-700">
                      Showing <span className="font-medium">{indexOfFirstItem + 1}</span> to{' '}
                      <span className="font-medium">
                        {Math.min(indexOfLastItem, filteredLeads.length)}
                      </span>{' '}
                      of <span className="font-medium">{filteredLeads.length}</span> leads
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 border rounded disabled:opacity-50 text-sm"
                      >
                        Previous
                      </button>
                      {[...Array(Math.min(5, totalPages))].map((_, i) => {
                        const pageNumber = i + 1;
                        return (
                          <button
                            key={i}
                            onClick={() => setCurrentPage(pageNumber)}
                            className={`px-3 py-1 border rounded text-sm ${
                              currentPage === pageNumber ? 'bg-blue-600 text-white' : ''
                            }`}
                          >
                            {pageNumber}
                          </button>
                        );
                      })}
                      {totalPages > 5 && (
                        <span className="px-2 py-1">...</span>
                      )}
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 border rounded disabled:opacity-50 text-sm"
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

      {/* Status Legend */}
      <div className="px-4 sm:px-6 py-4">
        <div className="bg-white rounded-xl shadow p-4">
          <h3 className="text-sm font-medium mb-3">Status Legend</h3>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-2">
                <Circle className="w-3 h-3 mr-1" />
                New
              </span>
              <span className="text-xs text-gray-600">Recently added lead</span>
            </div>
            <div className="flex items-center">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 mr-2">
                <CheckCircle className="w-3 h-3 mr-1" />
                Open
              </span>
              <span className="text-xs text-gray-600">Lead is being followed up</span>
            </div>
            <div className="flex items-center">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 mr-2">
                <Star className="w-3 h-3 mr-1" />
                Important
              </span>
              <span className="text-xs text-gray-600">High priority lead</span>
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Lead Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] my-auto">
            <div className="p-4 sm:p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg sm:text-xl font-bold">
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
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium mb-1">Full Name *</label>
                    <input
                      type="text"
                      name="name"
                      required
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="Enter full name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Email *</label>
                    <input
                      type="email"
                      name="email"
                      required
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={formData.email}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={formData.phone}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Company</label>
                    <input
                      type="text"
                      name="company"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={formData.company}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Job Title</label>
                    <input
                      type="text"
                      name="job_title"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={formData.job_title}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Source</label>
                    <select
                      name="source"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
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
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={formData.status}
                      onChange={handleInputChange}
                    >
                      <option value="new">New</option>
                      <option value="open">Open</option>
                      <option value="important">Important</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Industry</label>
                    <input
                      type="text"
                      name="industry"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={formData.industry}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Last Contact Date</label>
                    <input
                      type="datetime-local"
                      name="last_contact_date"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={formData.last_contact_date}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Next Follow-up</label>
                    <input
                      type="datetime-local"
                      name="next_follow_up_date"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
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
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={formData.follow_up_notes}
                    onChange={handleInputChange}
                  />
                </div>
                
                <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setEditingLead(null);
                    }}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    {editingLead ? 'Update Lead' : 'Add Lead'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Reminder Modal */}
      {showReminderModal && selectedLeadForReminder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
            <div className="p-4 sm:p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg sm:text-xl font-bold">Schedule Follow-up</h2>
                <button
                  onClick={() => {
                    setShowReminderModal(false);
                    setSelectedLeadForReminder(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              
              <div className="mb-6">
                <div className="bg-gray-50 p-4 rounded-lg mb-4">
                  <p className="font-medium text-sm">
                    {selectedLeadForReminder.name}
                  </p>
                  <p className="text-xs text-gray-600">{selectedLeadForReminder.email}</p>
                  <p className="text-xs text-gray-600">{selectedLeadForReminder.company}</p>
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">
                    Schedule Follow-up Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={reminderDateTime}
                    onChange={(e) => setReminderDateTime(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">
                    Notes for Follow-up
                  </label>
                  <textarea
                    rows={3}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={reminderNotes}
                    onChange={(e) => setReminderNotes(e.target.value)}
                    placeholder="Add notes for this follow-up..."
                  />
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3">
                <button
                  onClick={() => {
                    setShowReminderModal(false);
                    setSelectedLeadForReminder(null);
                  }}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={scheduleReminder}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  Schedule Follow-up
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Data Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
            <div className="p-4 sm:p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg sm:text-xl font-bold">Import Leads</h2>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              
              <div className="mb-6">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 sm:p-8 text-center">
                  <Upload className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-gray-400 mb-4" />
                  
                  <div className="flex justify-center space-x-4 mb-4">
                    <button
                      onClick={() => setImportType('csv')}
                      className={`px-4 py-2 rounded-lg text-sm ${importType === 'csv' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100'}`}
                    >
                      <FileText className="w-4 h-4 inline mr-2" />
                      CSV
                    </button>
                    <button
                      onClick={() => setImportType('excel')}
                      className={`px-4 py-2 rounded-lg text-sm ${importType === 'excel' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100'}`}
                    >
                      <FileSpreadsheet className="w-4 h-4 inline mr-2" />
                      Excel
                    </button>
                  </div>
                  
                  <p className="text-gray-600 mb-2 text-sm">Drag and drop {importType.toUpperCase()} file or</p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept={importType === 'csv' ? '.csv' : '.xlsx,.xls'}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    Browse Files
                  </button>
                  <p className="text-xs text-gray-500 mt-4">
                    Supported format: {importType.toUpperCase()} with columns: Name, Email, Phone, Company, Job Title, etc.
                  </p>
                </div>
              </div>
              
              <div className="text-sm text-gray-600 mb-4">
                <p className="font-medium mb-2">File Format Requirements:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>First row should contain headers</li>
                  <li>Required columns: Name, Email</li>
                  <li>Optional columns: Phone, Company, Job Title, Source, Status, Industry, etc.</li>
                  <li>Duplicate emails will be skipped</li>
                </ul>
              </div>
              
              <div className="flex justify-end">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm"
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
