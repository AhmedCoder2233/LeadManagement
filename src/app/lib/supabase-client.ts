import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for database tables
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal_sent' | 'converted' | 'lost';
export type LeadPriority = 'low' | 'medium' | 'high';
export type LeadSource = 'website' | 'referral' | 'social_media' | 'event' | 'cold_call' | 'other';

export interface Lead {
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
  assigned_to?: string;
  created_by?: string;
}

export type LeadInsert = Omit<Lead, 'id' | 'created_at' | 'updated_at'>;
export type LeadUpdate = Partial<LeadInsert>;