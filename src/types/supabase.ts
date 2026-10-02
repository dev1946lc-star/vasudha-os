export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      collections: {
        Row: {
          id: string
          company_id: string
          restaurant_id: string
          agent_id: string
          collection_date: string
          status: string
          notes: string | null
          total_quantity: number
          total_amount: number
          invoice_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          restaurant_id: string
          agent_id: string
          collection_date?: string
          status?: string
          notes?: string | null
          total_quantity?: number
          total_amount?: number
          invoice_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          restaurant_id?: string
          agent_id?: string
          collection_date?: string
          status?: string
          notes?: string | null
          total_quantity?: number
          total_amount?: number
          invoice_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_items: {
        Row: {
          id: string
          collection_id: string
          product_id: string
          quantity: number
          return_quantity: number
          price_per_unit: number
          amount: number
        }
        Insert: {
          id?: string
          collection_id: string
          product_id: string
          quantity: number
          return_quantity?: number
          price_per_unit: number
          amount: number
        }
        Update: {
          id?: string
          collection_id?: string
          product_id?: string
          quantity?: number
          return_quantity?: number
          price_per_unit?: number
          amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          id: string
          name: string
          gst_number: string | null
          address: string | null
          logo_url: string | null
          default_gst_rate: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          gst_number?: string | null
          address?: string | null
          logo_url?: string | null
          default_gst_rate?: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          gst_number?: string | null
          address?: string | null
          logo_url?: string | null
          default_gst_rate?: number
          created_at?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          id: string
          company_id: string
          product_id: string
          quantity: number
          last_updated: string
        }
        Insert: {
          id?: string
          company_id: string
          product_id: string
          quantity?: number
          last_updated?: string
        }
        Update: {
          id?: string
          company_id?: string
          product_id?: string
          quantity?: number
          last_updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          id: string
          company_id: string
          restaurant_id: string
          invoice_number: string
          invoice_date: string
          subtotal: number
          cgst: number
          sgst: number
          igst: number
          total_amount: number
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          restaurant_id: string
          invoice_number: string
          invoice_date: string
          subtotal: number
          cgst?: number
          sgst?: number
          igst?: number
          total_amount: number
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          restaurant_id?: string
          invoice_number?: string
          invoice_date?: string
          subtotal?: number
          cgst?: number
          sgst?: number
          igst?: number
          total_amount?: number
          status?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          id: string
          company_id: string
          restaurant_id: string
          invoice_id: string | null
          amount: number
          payment_mode: string | null
          payment_date: string
          reference_number: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          restaurant_id: string
          invoice_id?: string | null
          amount: number
          payment_mode?: string | null
          payment_date?: string
          reference_number?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          restaurant_id?: string
          invoice_id?: string | null
          amount?: number
          payment_mode?: string | null
          payment_date?: string
          reference_number?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          id: string
          company_id: string
          name: string
          description: string | null
          hsn_code: string | null
          price: number
          gst_rate: number
          is_active: boolean
          min_stock_level: number
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          description?: string | null
          hsn_code?: string | null
          price: number
          gst_rate?: number
          is_active?: boolean
          min_stock_level?: number
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          name?: string
          description?: string | null
          hsn_code?: string | null
          price?: number
          gst_rate?: number
          is_active?: boolean
          min_stock_level?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          id: string
          company_id: string
          role: string
          name: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id: string
          company_id: string
          role: string
          name: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          role?: string
          name?: string
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      restaurants: {
        Row: {
          id: string
          company_id: string
          name: string
          address: string | null
          contact_person: string | null
          phone: string | null
          credit_limit: number
          payment_terms_days: number
          is_active: boolean
          gst_number: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          address?: string | null
          contact_person?: string | null
          phone?: string | null
          credit_limit?: number
          payment_terms_days?: number
          is_active?: boolean
          gst_number?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          company_id?: string
          name?: string
          address?: string | null
          contact_person?: string | null
          phone?: string | null
          credit_limit?: number
          payment_terms_days?: number
          is_active?: boolean
          gst_number?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_sequences: {
        Row: {
          company_id: string
          last_value: number
        }
        Insert: {
          company_id: string
          last_value?: number
        }
        Update: {
          company_id?: string
          last_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_sequences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      invoice_outstanding: {
        Row: {
          invoice_id: string
          company_id: string
          restaurant_id: string
          invoice_number: string
          invoice_date: string
          total_amount: number
          status: string
          paid_amount: number
          outstanding_amount: number
          days_overdue: number
        }
        Relationships: []
      }
      restaurant_outstanding: {
        Row: {
          company_id: string
          restaurant_id: string
          restaurant_name: string
          phone: string | null
          unpaid_invoice_count: number
          total_outstanding: number
          bucket_0_15: number
          bucket_15_30: number
          bucket_30_60: number
          bucket_60_plus: number
        }
        Relationships: []
      }
      detailed_aging_report: {
        Row: {
          company_id: string
          restaurant_id: string
          restaurant_name: string
          invoice_id: string
          invoice_number: string
          invoice_date: string
          outstanding_amount: number
          days_overdue: number
          aging_bucket: string
        }
        Relationships: []
      }
      gstr1_report: {
        Row: {
          id: string
          company_id: string
          recipient_gstin: string
          receiver_name: string
          invoice_number: string
          invoice_date: string
          invoice_value: number
          taxable_value: number
          cgst: number
          sgst: number
          igst: number
        }
        Relationships: []
      }
    }
    Functions: {
      get_revenue_trend: {
        Args: {
          p_days: number
        }
        Returns: {
          payment_date: string
          total_revenue: number
        }[]
      }
      record_collection: {
        Args: {
          p_restaurant_id: string
          p_notes: string
          p_items: Json
        }
        Returns: string
      }
      add_stock: {
        Args: {
          p_product_id: string
          p_quantity: number
        }
        Returns: undefined
      }
      generate_bulk_invoice: {
        Args: {
          p_collection_ids: string[]
        }
        Returns: string
      }
      get_sales_by_product: {
        Args: {
          p_start: string
          p_end: string
        }
        Returns: Json[]
      }
      get_sales_by_restaurant: {
        Args: {
          p_start: string
          p_end: string
        }
        Returns: Json[]
      }
      setup_company_and_profile: {
        Args: {
          company_name: string
          gst_number: string
          address: string
          user_name: string
        }
        Returns: string
      }
      update_company_profile: {
        Args: {
          p_name: string
          p_gst_number: string
          p_address: string
          p_logo_url: string
        }
        Returns: undefined
      }
      update_tax_settings: {
        Args: {
          p_default_gst_rate: number
        }
        Returns: undefined
      }
      update_user_status: {
        Args: {
          p_user_id: string
          p_is_active: boolean
          p_role: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
