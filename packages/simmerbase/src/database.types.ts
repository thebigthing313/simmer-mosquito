export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      additional_personnel: {
        Row: {
          aerial_inspection_id: string | null
          application_id: string | null
          created_at: string
          created_by: string | null
          flight_id: string | null
          group_id: string
          id: string
          inspection_id: string | null
          parent_table_name: string | null
          personnel_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aerial_inspection_id?: string | null
          application_id?: string | null
          created_at?: string
          created_by?: string | null
          flight_id?: string | null
          group_id: string
          id?: string
          inspection_id?: string | null
          parent_table_name?: string | null
          personnel_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aerial_inspection_id?: string | null
          application_id?: string | null
          created_at?: string
          created_by?: string | null
          flight_id?: string | null
          group_id?: string
          id?: string
          inspection_id?: string | null
          parent_table_name?: string | null
          personnel_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "additional_personnel_aerial_inspection_id_fkey"
            columns: ["aerial_inspection_id"]
            isOneToOne: false
            referencedRelation: "aerial_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "additional_personnel_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "additional_personnel_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "additional_personnel_flight_id_fkey"
            columns: ["flight_id"]
            isOneToOne: false
            referencedRelation: "flights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "additional_personnel_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "additional_personnel_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "additional_personnel_personnel_id_fkey"
            columns: ["personnel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "additional_personnel_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      address_tags: {
        Row: {
          address_id: string
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          tag_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_id: string
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          tag_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_id?: string
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          tag_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "address_tags_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "address_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "address_tags_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "address_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "address_tags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      addresses: {
        Row: {
          address_fields: Json
          created_at: string
          created_by: string | null
          display_name: string
          geom: unknown
          group_id: string
          id: string
          lat: number
          lng: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_fields: Json
          created_at?: string
          created_by?: string | null
          display_name: string
          geom?: unknown
          group_id: string
          id?: string
          lat: number
          lng: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_fields?: Json
          created_at?: string
          created_by?: string | null
          display_name?: string
          geom?: unknown
          group_id?: string
          id?: string
          lat?: number
          lng?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addresses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "addresses_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addresses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      aerial_inspections: {
        Row: {
          aerial_site_id: string
          created_at: string
          created_by: string | null
          density_id: string | null
          dips_count: number | null
          group_id: string
          id: string
          inspected_by: string
          inspection_date: string
          is_wet: boolean
          larvae_count: number | null
          larvae_per_dip: number | null
          notes: string | null
          result: Database["public"]["Enums"]["aerial_inspection_result"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aerial_site_id: string
          created_at?: string
          created_by?: string | null
          density_id?: string | null
          dips_count?: number | null
          group_id: string
          id?: string
          inspected_by: string
          inspection_date: string
          is_wet?: boolean
          larvae_count?: number | null
          larvae_per_dip?: number | null
          notes?: string | null
          result: Database["public"]["Enums"]["aerial_inspection_result"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aerial_site_id?: string
          created_at?: string
          created_by?: string | null
          density_id?: string | null
          dips_count?: number | null
          group_id?: string
          id?: string
          inspected_by?: string
          inspection_date?: string
          is_wet?: boolean
          larvae_count?: number | null
          larvae_per_dip?: number | null
          notes?: string | null
          result?: Database["public"]["Enums"]["aerial_inspection_result"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aerial_inspections_aerial_site_id_fkey"
            columns: ["aerial_site_id"]
            isOneToOne: false
            referencedRelation: "aerial_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aerial_inspections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "aerial_inspections_density_id_fkey"
            columns: ["density_id"]
            isOneToOne: false
            referencedRelation: "densities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aerial_inspections_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aerial_inspections_inspected_by_fkey"
            columns: ["inspected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "aerial_inspections_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      aerial_sites: {
        Row: {
          aerial_site_code: string | null
          aerial_site_name: string
          created_at: string
          created_by: string | null
          geojson: Json
          geom: unknown
          group_id: string
          id: string
          is_active: boolean
          metadata: Json | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aerial_site_code?: string | null
          aerial_site_name: string
          created_at?: string
          created_by?: string | null
          geojson: Json
          geom?: unknown
          group_id: string
          id?: string
          is_active?: boolean
          metadata?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aerial_site_code?: string | null
          aerial_site_name?: string
          created_at?: string
          created_by?: string | null
          geojson?: Json
          geom?: unknown
          group_id?: string
          id?: string
          is_active?: boolean
          metadata?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aerial_sites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "aerial_sites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aerial_sites_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      applications: {
        Row: {
          amount_applied: number
          application_date: string
          application_unit_id: string
          applicator_id: string
          batch_id: string | null
          catch_basin_mission_id: string | null
          created_at: string
          created_by: string | null
          flight_aerial_site_id: string | null
          group_id: string
          hand_ulv_id: string | null
          id: string
          insecticide_id: string
          inspection_id: string | null
          truck_ulv_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_applied: number
          application_date: string
          application_unit_id: string
          applicator_id: string
          batch_id?: string | null
          catch_basin_mission_id?: string | null
          created_at?: string
          created_by?: string | null
          flight_aerial_site_id?: string | null
          group_id: string
          hand_ulv_id?: string | null
          id?: string
          insecticide_id: string
          inspection_id?: string | null
          truck_ulv_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_applied?: number
          application_date?: string
          application_unit_id?: string
          applicator_id?: string
          batch_id?: string | null
          catch_basin_mission_id?: string | null
          created_at?: string
          created_by?: string | null
          flight_aerial_site_id?: string | null
          group_id?: string
          hand_ulv_id?: string | null
          id?: string
          insecticide_id?: string
          inspection_id?: string | null
          truck_ulv_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_application_unit_id_fkey"
            columns: ["application_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_applicator_id_fkey"
            columns: ["applicator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "applications_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "insecticide_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_catch_basin_mission_id_fkey"
            columns: ["catch_basin_mission_id"]
            isOneToOne: false
            referencedRelation: "catch_basin_missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "applications_flight_aerial_site_id_fkey"
            columns: ["flight_aerial_site_id"]
            isOneToOne: false
            referencedRelation: "flight_aerial_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_hand_ulv_id_fkey"
            columns: ["hand_ulv_id"]
            isOneToOne: false
            referencedRelation: "hand_ulvs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_insecticide_id_fkey"
            columns: ["insecticide_id"]
            isOneToOne: false
            referencedRelation: "insecticides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_truck_ulv_id_fkey"
            columns: ["truck_ulv_id"]
            isOneToOne: false
            referencedRelation: "truck_ulvs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      catch_basin_missions: {
        Row: {
          basin_count: number
          created_at: string
          created_by: string | null
          geojson: Json | null
          geom: unknown
          group_id: string
          id: string
          notes: string | null
          sample_dry: number | null
          sample_wet: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          basin_count: number
          created_at?: string
          created_by?: string | null
          geojson?: Json | null
          geom?: unknown
          group_id: string
          id?: string
          notes?: string | null
          sample_dry?: number | null
          sample_wet?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          basin_count?: number
          created_at?: string
          created_by?: string | null
          geojson?: Json | null
          geom?: unknown
          group_id?: string
          id?: string
          notes?: string | null
          sample_dry?: number | null
          sample_wet?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catch_basin_missions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "catch_basin_missions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catch_basin_missions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      collection_results: {
        Row: {
          collection_id: string | null
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          identified_by: string | null
          landing_rate_id: string | null
          mosquito_count: number
          sex: Database["public"]["Enums"]["mosquito_sex"] | null
          species_id: string
          status: Database["public"]["Enums"]["mosquito_status"] | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          collection_id?: string | null
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          identified_by?: string | null
          landing_rate_id?: string | null
          mosquito_count: number
          sex?: Database["public"]["Enums"]["mosquito_sex"] | null
          species_id: string
          status?: Database["public"]["Enums"]["mosquito_status"] | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          collection_id?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          identified_by?: string | null
          landing_rate_id?: string | null
          mosquito_count?: number
          sex?: Database["public"]["Enums"]["mosquito_sex"] | null
          species_id?: string
          status?: Database["public"]["Enums"]["mosquito_status"] | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_results_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_results_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "collection_results_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_results_identified_by_fkey"
            columns: ["identified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "collection_results_landing_rate_id_fkey"
            columns: ["landing_rate_id"]
            isOneToOne: false
            referencedRelation: "landing_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_results_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_results_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      collections: {
        Row: {
          collected_by: string | null
          collection_date: string | null
          created_at: string
          created_by: string | null
          group_id: string
          has_error: boolean | null
          id: string
          trap_id: string
          trap_lure_id: string | null
          trap_nights: number | null
          trap_set_by: string | null
          trap_set_date: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          collected_by?: string | null
          collection_date?: string | null
          created_at?: string
          created_by?: string | null
          group_id: string
          has_error?: boolean | null
          id?: string
          trap_id: string
          trap_lure_id?: string | null
          trap_nights?: number | null
          trap_set_by?: string | null
          trap_set_date?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          collected_by?: string | null
          collection_date?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string
          has_error?: boolean | null
          id?: string
          trap_id?: string
          trap_lure_id?: string | null
          trap_nights?: number | null
          trap_set_by?: string | null
          trap_set_date?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collections_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "collections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "collections_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_trap_id_fkey"
            columns: ["trap_id"]
            isOneToOne: false
            referencedRelation: "traps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_trap_lure_id_fkey"
            columns: ["trap_lure_id"]
            isOneToOne: false
            referencedRelation: "trap_lures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collections_trap_set_by_fkey"
            columns: ["trap_set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "collections_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      comments: {
        Row: {
          aerial_site_id: string | null
          collection_id: string | null
          comment_text: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          is_pinned: boolean
          landing_rate_id: string | null
          notification_id: string | null
          parent_id: string | null
          parent_type: string | null
          sample_id: string | null
          service_request_id: string | null
          trap_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aerial_site_id?: string | null
          collection_id?: string | null
          comment_text: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          is_pinned?: boolean
          landing_rate_id?: string | null
          notification_id?: string | null
          parent_id?: string | null
          parent_type?: string | null
          sample_id?: string | null
          service_request_id?: string | null
          trap_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aerial_site_id?: string | null
          collection_id?: string | null
          comment_text?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          is_pinned?: boolean
          landing_rate_id?: string | null
          notification_id?: string | null
          parent_id?: string | null
          parent_type?: string | null
          sample_id?: string | null
          service_request_id?: string | null
          trap_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_aerial_site_id_fkey"
            columns: ["aerial_site_id"]
            isOneToOne: false
            referencedRelation: "aerial_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "comments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_landing_rate_id_fkey"
            columns: ["landing_rate_id"]
            isOneToOne: false
            referencedRelation: "landing_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_trap_id_fkey"
            columns: ["trap_id"]
            isOneToOne: false
            referencedRelation: "traps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      contacts: {
        Row: {
          alternate_phone: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          department: string | null
          email: string | null
          fax: string | null
          group_id: string
          id: string
          metadata: Json | null
          organization: string | null
          preferred_phone: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alternate_phone?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          email?: string | null
          fax?: string | null
          group_id: string
          id?: string
          metadata?: Json | null
          organization?: string | null
          preferred_phone?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alternate_phone?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          email?: string | null
          fax?: string | null
          group_id?: string
          id?: string
          metadata?: Json | null
          organization?: string | null
          preferred_phone?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "contacts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      densities: {
        Row: {
          created_at: string
          created_by: string | null
          density_name: string
          group_id: string
          id: string
          range_max: number | null
          range_min: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          density_name: string
          group_id: string
          id?: string
          range_max?: number | null
          range_min?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          density_name?: string
          group_id?: string
          id?: string
          range_max?: number | null
          range_min?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "densities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "densities_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "densities_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      flight_aerial_sites: {
        Row: {
          aerial_site_id: string
          created_at: string
          created_by: string | null
          flight_id: string
          group_id: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aerial_site_id: string
          created_at?: string
          created_by?: string | null
          flight_id: string
          group_id: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aerial_site_id?: string
          created_at?: string
          created_by?: string | null
          flight_id?: string
          group_id?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flight_aerial_sites_aerial_site_id_fkey"
            columns: ["aerial_site_id"]
            isOneToOne: false
            referencedRelation: "aerial_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_aerial_sites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "flight_aerial_sites_flight_id_fkey"
            columns: ["flight_id"]
            isOneToOne: false
            referencedRelation: "flights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_aerial_sites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_aerial_sites_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      flight_batches: {
        Row: {
          batch_id: string
          created_at: string
          created_by: string | null
          flight_id: string
          group_id: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_by?: string | null
          flight_id: string
          group_id: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by?: string | null
          flight_id?: string
          group_id?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flight_batches_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "insecticide_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "flight_batches_flight_id_fkey"
            columns: ["flight_id"]
            isOneToOne: false
            referencedRelation: "flights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_batches_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_batches_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      flights: {
        Row: {
          aircraft_id: string
          created_at: string
          created_by: string | null
          flight_by: string
          flight_date: string
          group_id: string
          id: string
          metadata: Json | null
          notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aircraft_id: string
          created_at?: string
          created_by?: string | null
          flight_by: string
          flight_date: string
          group_id: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aircraft_id?: string
          created_at?: string
          created_by?: string | null
          flight_by?: string
          flight_date?: string
          group_id?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flights_aircraft_id_fkey"
            columns: ["aircraft_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flights_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "flights_flight_by_fkey"
            columns: ["flight_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "flights_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flights_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      genera: {
        Row: {
          abbreviation: string
          description: string | null
          genus_name: string
          id: string
        }
        Insert: {
          abbreviation: string
          description?: string | null
          genus_name: string
          id?: string
        }
        Update: {
          abbreviation?: string
          description?: string | null
          genus_name?: string
          id?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          address: string
          created_at: string
          created_by: string | null
          fax: string | null
          group_name: string
          id: string
          phone: string
          short_name: string | null
          updated_at: string
          updated_by: string | null
          website_url: string | null
        }
        Insert: {
          address: string
          created_at?: string
          created_by?: string | null
          fax?: string | null
          group_name: string
          id?: string
          phone: string
          short_name?: string | null
          updated_at?: string
          updated_by?: string | null
          website_url?: string | null
        }
        Update: {
          address?: string
          created_at?: string
          created_by?: string | null
          fax?: string | null
          group_name?: string
          id?: string
          phone?: string
          short_name?: string | null
          updated_at?: string
          updated_by?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      habitat_tags: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          habitat_id: string
          id: string
          tag_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          habitat_id: string
          id?: string
          tag_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          habitat_id?: string
          id?: string
          tag_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "habitat_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "habitat_tags_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habitat_tags_habitat_id_fkey"
            columns: ["habitat_id"]
            isOneToOne: false
            referencedRelation: "habitats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habitat_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habitat_tags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      habitats: {
        Row: {
          address_id: string | null
          created_at: string
          created_by: string | null
          description: string
          geom: unknown
          group_id: string
          habitat_name: string | null
          id: string
          is_active: boolean
          is_inaccessible: boolean
          is_permanent: boolean
          lat: number
          lng: number
          metadata: Json | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          geom?: unknown
          group_id: string
          habitat_name?: string | null
          id?: string
          is_active?: boolean
          is_inaccessible?: boolean
          is_permanent?: boolean
          lat: number
          lng: number
          metadata?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          geom?: unknown
          group_id?: string
          habitat_name?: string | null
          id?: string
          is_active?: boolean
          is_inaccessible?: boolean
          is_permanent?: boolean
          lat?: number
          lng?: number
          metadata?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "habitats_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habitats_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "habitats_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habitats_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      hand_ulvs: {
        Row: {
          address_id: string | null
          created_at: string
          created_by: string | null
          end_temperature: number | null
          end_time: string | null
          end_wind_speed: number | null
          group_id: string
          id: string
          lat: number | null
          lng: number | null
          notes: string | null
          start_temperature: number | null
          start_time: string | null
          start_wind_speed: number | null
          temperature_unit_id: string | null
          updated_at: string
          updated_by: string | null
          wind_speed_unit_id: string | null
        }
        Insert: {
          address_id?: string | null
          created_at?: string
          created_by?: string | null
          end_temperature?: number | null
          end_time?: string | null
          end_wind_speed?: number | null
          group_id: string
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          start_temperature?: number | null
          start_time?: string | null
          start_wind_speed?: number | null
          temperature_unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          wind_speed_unit_id?: string | null
        }
        Update: {
          address_id?: string | null
          created_at?: string
          created_by?: string | null
          end_temperature?: number | null
          end_time?: string | null
          end_wind_speed?: number | null
          group_id?: string
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          start_temperature?: number | null
          start_time?: string | null
          start_wind_speed?: number | null
          temperature_unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          wind_speed_unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hand_ulvs_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hand_ulvs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hand_ulvs_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hand_ulvs_temperature_unit_id_fkey"
            columns: ["temperature_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hand_ulvs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "hand_ulvs_wind_speed_unit_id_fkey"
            columns: ["wind_speed_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      insecticide_batches: {
        Row: {
          batch_name: string
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          insecticide_id: string
          is_active: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          batch_name: string
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          insecticide_id: string
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          batch_name?: string
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          insecticide_id?: string
          is_active?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insecticide_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "insecticide_batches_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insecticide_batches_insecticide_id_fkey"
            columns: ["insecticide_id"]
            isOneToOne: false
            referencedRelation: "insecticides"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insecticide_batches_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      insecticides: {
        Row: {
          active_ingredient: string
          conversion_factor: number | null
          created_at: string
          created_by: string | null
          default_unit_id: string
          group_id: string
          id: string
          label_url: string | null
          metadata: Json | null
          msds_url: string | null
          registration_number: string
          shorthand: string | null
          trade_name: string
          type: Database["public"]["Enums"]["insecticide_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active_ingredient: string
          conversion_factor?: number | null
          created_at?: string
          created_by?: string | null
          default_unit_id: string
          group_id: string
          id?: string
          label_url?: string | null
          metadata?: Json | null
          msds_url?: string | null
          registration_number: string
          shorthand?: string | null
          trade_name: string
          type: Database["public"]["Enums"]["insecticide_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active_ingredient?: string
          conversion_factor?: number | null
          created_at?: string
          created_by?: string | null
          default_unit_id?: string
          group_id?: string
          id?: string
          label_url?: string | null
          metadata?: Json | null
          msds_url?: string | null
          registration_number?: string
          shorthand?: string | null
          trade_name?: string
          type?: Database["public"]["Enums"]["insecticide_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insecticides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "insecticides_default_unit_id_fkey"
            columns: ["default_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insecticides_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insecticides_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      inspections: {
        Row: {
          created_at: string
          created_by: string | null
          density_id: string | null
          dip_count: number | null
          group_id: string
          habitat_id: string
          has_eggs: boolean
          has_first_instar: boolean
          has_fourth_instar: boolean
          has_pupae: boolean
          has_second_instar: boolean
          has_third_instar: boolean
          id: string
          inspected_by: string | null
          inspection_date: string
          is_source_reduction: boolean
          is_wet: boolean
          larvae_count: number | null
          notes: string | null
          source_reduction_notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          density_id?: string | null
          dip_count?: number | null
          group_id: string
          habitat_id: string
          has_eggs?: boolean
          has_first_instar?: boolean
          has_fourth_instar?: boolean
          has_pupae?: boolean
          has_second_instar?: boolean
          has_third_instar?: boolean
          id?: string
          inspected_by?: string | null
          inspection_date: string
          is_source_reduction?: boolean
          is_wet?: boolean
          larvae_count?: number | null
          notes?: string | null
          source_reduction_notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          density_id?: string | null
          dip_count?: number | null
          group_id?: string
          habitat_id?: string
          has_eggs?: boolean
          has_first_instar?: boolean
          has_fourth_instar?: boolean
          has_pupae?: boolean
          has_second_instar?: boolean
          has_third_instar?: boolean
          id?: string
          inspected_by?: string | null
          inspection_date?: string
          is_source_reduction?: boolean
          is_wet?: boolean
          larvae_count?: number | null
          notes?: string | null
          source_reduction_notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inspections_density_id_fkey"
            columns: ["density_id"]
            isOneToOne: false
            referencedRelation: "densities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_habitat_id_fkey"
            columns: ["habitat_id"]
            isOneToOne: false
            referencedRelation: "habitats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_inspected_by_fkey"
            columns: ["inspected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inspections_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      landing_rates: {
        Row: {
          address_id: string | null
          created_at: string
          created_by: string | null
          duration_amount: number | null
          duration_unit_id: string | null
          geom: unknown
          group_id: string
          id: string
          landing_rate_by: string | null
          landing_rate_date: string
          lat: number
          lng: number
          observed_count: number
          sample_id: string | null
          started_at: string | null
          stopped_at: string | null
          temperature: number | null
          temperature_unit_id: string | null
          updated_at: string
          updated_by: string | null
          wind_speed: number | null
          wind_speed_unit_id: string | null
        }
        Insert: {
          address_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_amount?: number | null
          duration_unit_id?: string | null
          geom?: unknown
          group_id: string
          id?: string
          landing_rate_by?: string | null
          landing_rate_date: string
          lat: number
          lng: number
          observed_count: number
          sample_id?: string | null
          started_at?: string | null
          stopped_at?: string | null
          temperature?: number | null
          temperature_unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          wind_speed?: number | null
          wind_speed_unit_id?: string | null
        }
        Update: {
          address_id?: string | null
          created_at?: string
          created_by?: string | null
          duration_amount?: number | null
          duration_unit_id?: string | null
          geom?: unknown
          group_id?: string
          id?: string
          landing_rate_by?: string | null
          landing_rate_date?: string
          lat?: number
          lng?: number
          observed_count?: number
          sample_id?: string | null
          started_at?: string | null
          stopped_at?: string | null
          temperature?: number | null
          temperature_unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          wind_speed?: number | null
          wind_speed_unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "landing_rates_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "landing_rates_duration_unit_id_fkey"
            columns: ["duration_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_rates_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_rates_landing_rate_by_fkey"
            columns: ["landing_rate_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "landing_rates_temperature_unit_id_fkey"
            columns: ["temperature_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landing_rates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "landing_rates_wind_speed_unit_id_fkey"
            columns: ["wind_speed_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          address_id: string
          contact_id: string
          created_at: string
          created_by: string | null
          group_id: string
          has_bees: boolean
          id: string
          is_active: boolean
          is_no_spray: boolean
          radius: number | null
          radius_unit_id: string | null
          region_id: string | null
          updated_at: string
          updated_by: string | null
          wants_email: boolean
          wants_fax: boolean
          wants_phone: boolean
        }
        Insert: {
          address_id: string
          contact_id: string
          created_at?: string
          created_by?: string | null
          group_id: string
          has_bees?: boolean
          id?: string
          is_active?: boolean
          is_no_spray?: boolean
          radius?: number | null
          radius_unit_id?: string | null
          region_id?: string | null
          updated_at?: string
          updated_by?: string | null
          wants_email?: boolean
          wants_fax?: boolean
          wants_phone?: boolean
        }
        Update: {
          address_id?: string
          contact_id?: string
          created_at?: string
          created_by?: string | null
          group_id?: string
          has_bees?: boolean
          id?: string
          is_active?: boolean
          is_no_spray?: boolean
          radius?: number | null
          radius_unit_id?: string | null
          region_id?: string | null
          updated_at?: string
          updated_by?: string | null
          wants_email?: boolean
          wants_fax?: boolean
          wants_phone?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notifications_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_radius_unit_id_fkey"
            columns: ["radius_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          created_by: string | null
          full_name: string
          group_id: string
          id: string
          metadata: Json | null
          role_id: number | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          full_name: string
          group_id: string
          id?: string
          metadata?: Json | null
          role_id?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          full_name?: string
          group_id?: string
          id?: string
          metadata?: Json | null
          role_id?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profiles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      region_folders: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          region_folder_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          region_folder_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          region_folder_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "region_folders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "region_folders_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "region_folders_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      regions: {
        Row: {
          created_at: string
          created_by: string | null
          geojson: Json
          geom: unknown
          group_id: string | null
          id: string
          metadata: Json | null
          name_path: string | null
          parent_id: string | null
          region_folder_id: string | null
          region_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          geojson: Json
          geom?: unknown
          group_id?: string | null
          id?: string
          metadata?: Json | null
          name_path?: string | null
          parent_id?: string | null
          region_folder_id?: string | null
          region_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          geojson?: Json
          geom?: unknown
          group_id?: string | null
          id?: string
          metadata?: Json | null
          name_path?: string | null
          parent_id?: string | null
          region_folder_id?: string | null
          region_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "regions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regions_region_folder_id_fkey"
            columns: ["region_folder_id"]
            isOneToOne: false
            referencedRelation: "region_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      roles: {
        Row: {
          description: string | null
          id: number
          role_name: string
        }
        Insert: {
          description?: string | null
          id: number
          role_name: string
        }
        Update: {
          description?: string | null
          id?: number
          role_name?: string
        }
        Relationships: []
      }
      route_items: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          habitat_id: string | null
          id: string
          rank_string: string
          route_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          habitat_id?: string | null
          id?: string
          rank_string: string
          route_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          habitat_id?: string | null
          id?: string
          rank_string?: string
          route_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "route_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "route_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_items_habitat_id_fkey"
            columns: ["habitat_id"]
            isOneToOne: false
            referencedRelation: "habitats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_items_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      routes: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          route_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          route_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          route_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "routes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      sample_results: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          identified_at: string
          identified_by: string
          larvae_count: number
          sample_id: string
          species_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          identified_at: string
          identified_by: string
          larvae_count: number
          sample_id: string
          species_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          identified_at?: string
          identified_by?: string
          larvae_count?: number
          sample_id?: string
          species_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sample_results_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sample_results_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_results_identified_by_fkey"
            columns: ["identified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sample_results_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_results_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_results_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      samples: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string | null
          group_id: string
          id: string
          inspection_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          group_id: string
          id?: string
          inspection_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          group_id?: string
          id?: string
          inspection_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "samples_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "samples_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      service_request_tags: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          service_request_id: string
          tag_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          service_request_id: string
          tag_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          service_request_id?: string
          tag_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_request_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "service_request_tags_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_tags_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_tags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      service_requests: {
        Row: {
          address_id: string
          contact_id: string
          created_at: string
          created_by: string | null
          details: string
          display_number: number
          group_id: string
          id: string
          is_closed: boolean
          request_date: string
          source: Database["public"]["Enums"]["service_request_source"] | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_id: string
          contact_id: string
          created_at?: string
          created_by?: string | null
          details: string
          display_number: number
          group_id: string
          id?: string
          is_closed?: boolean
          request_date: string
          source?: Database["public"]["Enums"]["service_request_source"] | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_id?: string
          contact_id?: string
          created_at?: string
          created_by?: string | null
          details?: string
          display_number?: number
          group_id?: string
          id?: string
          is_closed?: boolean
          request_date?: string
          source?: Database["public"]["Enums"]["service_request_source"] | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "service_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      species: {
        Row: {
          description: string | null
          genus_id: string | null
          id: string
          species_name: string
        }
        Insert: {
          description?: string | null
          genus_id?: string | null
          id?: string
          species_name: string
        }
        Update: {
          description?: string | null
          genus_id?: string | null
          id?: string
          species_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "species_genus_id_fkey"
            columns: ["genus_id"]
            isOneToOne: false
            referencedRelation: "genera"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_groups: {
        Row: {
          id: string
          tag_group_name: string
        }
        Insert: {
          id?: string
          tag_group_name: string
        }
        Update: {
          id?: string
          tag_group_name?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          tag_group_id: string
          tag_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          tag_group_id: string
          tag_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          tag_group_id?: string
          tag_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tags_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_tag_group_id_fkey"
            columns: ["tag_group_id"]
            isOneToOne: false
            referencedRelation: "tag_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      trap_lures: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string | null
          id: string
          lure_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          lure_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          lure_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trap_lures_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "trap_lures_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trap_lures_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      trap_tags: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          tag_id: string
          trap_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          tag_id: string
          trap_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          tag_id?: string
          trap_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trap_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "trap_tags_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trap_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trap_tags_trap_id_fkey"
            columns: ["trap_id"]
            isOneToOne: false
            referencedRelation: "traps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trap_tags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      trap_types: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string | null
          id: string
          shorthand: string | null
          trap_type_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          shorthand?: string | null
          trap_type_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          id?: string
          shorthand?: string | null
          trap_type_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trap_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "trap_types_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trap_types_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      traps: {
        Row: {
          address_id: string | null
          created_at: string
          created_by: string | null
          geom: unknown
          group_id: string
          id: string
          is_active: boolean
          is_permanent: boolean
          lat: number
          lng: number
          metadata: Json | null
          trap_code: string | null
          trap_name: string | null
          trap_type_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_id?: string | null
          created_at?: string
          created_by?: string | null
          geom?: unknown
          group_id: string
          id?: string
          is_active?: boolean
          is_permanent?: boolean
          lat: number
          lng: number
          metadata?: Json | null
          trap_code?: string | null
          trap_name?: string | null
          trap_type_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_id?: string | null
          created_at?: string
          created_by?: string | null
          geom?: unknown
          group_id?: string
          id?: string
          is_active?: boolean
          is_permanent?: boolean
          lat?: number
          lng?: number
          metadata?: Json | null
          trap_code?: string | null
          trap_name?: string | null
          trap_type_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "traps_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traps_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "traps_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traps_trap_type_id_fkey"
            columns: ["trap_type_id"]
            isOneToOne: false
            referencedRelation: "trap_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traps_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      truck_ulvs: {
        Row: {
          area_description: string | null
          created_at: string
          created_by: string | null
          end_odometer: number | null
          end_temperature: number | null
          end_time: string | null
          end_wind_speed: number | null
          geojson: Json | null
          geom: unknown
          group_id: string
          id: string
          notes: string | null
          start_odometer: number | null
          start_temperature: number | null
          start_time: string | null
          start_wind_speed: number | null
          temperature_unit_id: string | null
          updated_at: string
          updated_by: string | null
          vehicle_id: string | null
          wind_speed_unit_id: string | null
        }
        Insert: {
          area_description?: string | null
          created_at?: string
          created_by?: string | null
          end_odometer?: number | null
          end_temperature?: number | null
          end_time?: string | null
          end_wind_speed?: number | null
          geojson?: Json | null
          geom?: unknown
          group_id: string
          id?: string
          notes?: string | null
          start_odometer?: number | null
          start_temperature?: number | null
          start_time?: string | null
          start_wind_speed?: number | null
          temperature_unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string | null
          wind_speed_unit_id?: string | null
        }
        Update: {
          area_description?: string | null
          created_at?: string
          created_by?: string | null
          end_odometer?: number | null
          end_temperature?: number | null
          end_time?: string | null
          end_wind_speed?: number | null
          geojson?: Json | null
          geom?: unknown
          group_id?: string
          id?: string
          notes?: string | null
          start_odometer?: number | null
          start_temperature?: number | null
          start_time?: string | null
          start_wind_speed?: number | null
          temperature_unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string | null
          wind_speed_unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "truck_ulvs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "truck_ulvs_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "truck_ulvs_temperature_unit_id_fkey"
            columns: ["temperature_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "truck_ulvs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "truck_ulvs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "truck_ulvs_wind_speed_unit_id_fkey"
            columns: ["wind_speed_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      ulv_missions: {
        Row: {
          area_description: string | null
          completion_date: string | null
          created_at: string
          created_by: string | null
          end_time: string | null
          geojson: Json | null
          geom: unknown
          group_id: string
          id: string
          is_cancelled: boolean
          mission_date: string
          rain_date: string | null
          start_time: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          area_description?: string | null
          completion_date?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          geojson?: Json | null
          geom?: unknown
          group_id: string
          id?: string
          is_cancelled?: boolean
          mission_date: string
          rain_date?: string | null
          start_time?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          area_description?: string | null
          completion_date?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          geojson?: Json | null
          geom?: unknown
          group_id?: string
          id?: string
          is_cancelled?: boolean
          mission_date?: string
          rain_date?: string | null
          start_time?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ulv_missions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ulv_missions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ulv_missions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      units: {
        Row: {
          abbreviation: string
          base_unit_id: string | null
          conversion_factor: number | null
          conversion_offset: number | null
          id: string
          unit_name: string
          unit_system: Database["public"]["Enums"]["unit_system"] | null
          unit_type: Database["public"]["Enums"]["unit_type"] | null
        }
        Insert: {
          abbreviation: string
          base_unit_id?: string | null
          conversion_factor?: number | null
          conversion_offset?: number | null
          id?: string
          unit_name: string
          unit_system?: Database["public"]["Enums"]["unit_system"] | null
          unit_type?: Database["public"]["Enums"]["unit_type"] | null
        }
        Update: {
          abbreviation?: string
          base_unit_id?: string | null
          conversion_factor?: number | null
          conversion_offset?: number | null
          id?: string
          unit_name?: string
          unit_system?: Database["public"]["Enums"]["unit_system"] | null
          unit_type?: Database["public"]["Enums"]["unit_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "units_base_unit_id_fkey"
            columns: ["base_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          metadata: Json | null
          updated_at: string
          updated_by: string | null
          vehicle_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          metadata?: Json | null
          updated_at?: string
          updated_by?: string | null
          vehicle_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          metadata?: Json | null
          updated_at?: string
          updated_by?: string | null
          vehicle_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "vehicles_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      user_has_group_role: {
        Args: { p_group_id: string; p_role_id: number }
        Returns: boolean
      }
      user_is_group_member: { Args: { p_group_id: string }; Returns: boolean }
      user_owns_record: { Args: { p_user_id: string }; Returns: boolean }
    }
    Enums: {
      aerial_inspection_result: "recheck" | "fly" | "hand treat" | "no action"
      insecticide_type: "larvicide" | "adulticide" | "pupicide" | "other"
      mosquito_sex: "male" | "female"
      mosquito_status: "damaged" | "unfed" | "bloodfed" | "gravid"
      service_request_source: "online" | "phone" | "walk-in" | "other"
      unit_system: "si" | "imperial" | "us_customary"
      unit_type:
        | "weight"
        | "distance"
        | "area"
        | "volume"
        | "temperature"
        | "duration"
        | "count"
        | "speed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      aerial_inspection_result: ["recheck", "fly", "hand treat", "no action"],
      insecticide_type: ["larvicide", "adulticide", "pupicide", "other"],
      mosquito_sex: ["male", "female"],
      mosquito_status: ["damaged", "unfed", "bloodfed", "gravid"],
      service_request_source: ["online", "phone", "walk-in", "other"],
      unit_system: ["si", "imperial", "us_customary"],
      unit_type: [
        "weight",
        "distance",
        "area",
        "volume",
        "temperature",
        "duration",
        "count",
        "speed",
      ],
    },
  },
} as const

