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
          due_date: string
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
          due_date: string
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
          due_date?: string
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
          /** Soft-delete marker. NULL means active. */
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
          /** Soft-delete marker. NULL means active. Rows are kept so
           *  invoices, payments and collections keep a valid referent. */
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
      /** Unallocated credit per restaurant: advance payments not yet matched
       *  to an invoice. Replaces the old behaviour where an overpayment simply
       *  disappeared from the money-owed figures. */
      restaurant_credit: {
        Row: {
          company_id: string
          restaurant_id: string
          amount: number
          updated_at: string
        }
        Insert: {
          company_id: string
          restaurant_id: string
          amount?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          restaurant_id?: string
          amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_credit_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_credit_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      /** Which invoice each slice of a payment settled. Derived, never
       *  authoritative: payments.amount is what was actually received and is
       *  what a receipt must report. */
      payment_allocations: {
        Row: {
          id: string
          payment_id: string
          invoice_id: string
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          payment_id: string
          invoice_id: string
          amount: number
          created_at?: string
        }
        Update: {
          id?: string
          payment_id?: string
          invoice_id?: string
          amount?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_items: {
        Row: {
          id: string
          invoice_id: string
          product_id: string
          /** Net of returns: what the customer is charged for. */
          quantity: number
          gross_quantity: number
          return_quantity: number
          unit_price: number
          hsn_code: string | null
          gst_rate: number
          taxable_amount: number
          cgst: number
          sgst: number
          igst: number
          total_amount: number
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          product_id: string
          quantity: number
          gross_quantity: number
          return_quantity?: number
          unit_price: number
          hsn_code?: string | null
          gst_rate?: number
          taxable_amount: number
          cgst?: number
          sgst?: number
          igst?: number
          total_amount: number
          created_at?: string
        }
        Update: {
          id?: string
          invoice_id?: string
          product_id?: string
          quantity?: number
          gross_quantity?: number
          return_quantity?: number
          unit_price?: number
          hsn_code?: string | null
          gst_rate?: number
          taxable_amount?: number
          cgst?: number
          sgst?: number
          igst?: number
          total_amount?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      /** Invoice-level ageing. days_overdue is measured from due_date and is
       *  NEGATIVE while the invoice is not yet due; `bucket` is 'current' then. */
      invoice_aging: {
        Row: {
          id: string
          company_id: string
          restaurant_id: string
          restaurant_name: string
          invoice_number: string
          invoice_date: string
          due_date: string
          total_amount: number
          outstanding_amount: number
          days_overdue: number
          bucket: string
        }
        Relationships: []
      }
      invoice_outstanding: {
        Row: {
          invoice_id: string
          company_id: string
          restaurant_id: string
          invoice_number: string
          invoice_date: string
          due_date: string
          total_amount: number
          status: string
          paid_amount: number
          outstanding_amount: number
          /** Measured from due_date. Negative means not yet due. */
          days_overdue: number
          is_due: string
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
          /** Invoiced but still inside the payment term. Not overdue. */
          bucket_current: number
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
          /** Records a payment and allocates it oldest-invoice-first. Surplus becomes
       *  restaurant_credit rather than disappearing. p_invoice_id may be NULL for
       *  an advance. Required params come first: Postgres requires every
       *  parameter after the first defaulted one to also be defaulted. */
      record_payment: {
        Args: {
          p_restaurant_id: string
          p_amount: number
          p_payment_mode: string
          p_invoice_id?: string
          p_payment_date?: string
          p_reference?: string
        }
        Returns:
          | {
              payment_id: string
              allocated: number
              credit_left: number
              invoices_hit: number
            }[]
          | null
      }
      /** Issues one invoice per distinct restaurant from verified collections.
       *  Returns a row per invoice issued; skipped collections produce no row. */
      generate_bulk_invoices_batch: {
        Args: { p_collection_ids: string[] }
        Returns:
          | {
              restaurant_id: string
              restaurant_name: string
              invoice_id: string
              invoice_number: string
              total_amount: number
            }[]
          | null
      }
      /** Outstanding balance and credit-limit breach. credit_limit = 0 means
       *  unlimited. */
      restaurant_credit_status: {
        Args: { p_restaurant_id: string; p_extra_amount?: number }
        Returns: { outstanding: number; credit_limit: number; exceeded: boolean }[]
      }
      /** Outstanding balance against a restaurant's credit limit, for surfacing
       *  on the day's route. unlimited = TRUE when credit_limit is 0. */
      restaurant_credit_exposure: {
        Args: { p_restaurant_id: string }
        Returns:
          | {
              outstanding: number
              credit_limit: number
              headroom: number
              exceeded: boolean
              unlimited: boolean
            }[]
          | null
      }
      refresh_invoice_status_for_restaurant: {
        Args: { p_restaurant_id: string }
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
      /** Soft-deletes a restaurant. Refuses while an invoice is still
       *  outstanding, naming the amount. The row is kept so invoices, payments
       *  and collections keep a valid referent. */
      delete_restaurant: {
        Args: { p_restaurant_id: string }
        Returns: boolean
      }
      restore_restaurant: {
        Args: { p_restaurant_id: string }
        Returns: boolean
      }
      /** Soft-deletes a product. collection_items and bill_items reference it. */
      delete_product: {
        Args: { p_product_id: string }
        Returns: boolean
      }
      restore_product: {
        Args: { p_product_id: string }
        Returns: boolean
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
