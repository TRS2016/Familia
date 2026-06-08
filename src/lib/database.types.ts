export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
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
      event_reminders_sent: {
        Row: {
          event_id: string
          id: string
          reminded_at: string | null
        }
        Insert: {
          event_id: string
          id?: string
          reminded_at?: string | null
        }
        Update: {
          event_id?: string
          id?: string
          reminded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_reminders_sent_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          all_day: boolean
          created_at: string
          created_by: string | null
          date: string
          description: string | null
          end_time: string | null
          household_id: string
          id: string
          location: string | null
          member_id: string | null
          recurrence_group_id: string | null
          recurrence_type: string | null
          reminder_minutes: number | null
          start_time: string | null
          title: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          created_by?: string | null
          date: string
          description?: string | null
          end_time?: string | null
          household_id: string
          id?: string
          location?: string | null
          member_id?: string | null
          recurrence_group_id?: string | null
          recurrence_type?: string | null
          reminder_minutes?: number | null
          start_time?: string | null
          title: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          created_by?: string | null
          date?: string
          description?: string | null
          end_time?: string | null
          household_id?: string
          id?: string
          location?: string | null
          member_id?: string | null
          recurrence_group_id?: string | null
          recurrence_type?: string | null
          reminder_minutes?: number | null
          start_time?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      groceries: {
        Row: {
          category: string | null
          checked: boolean
          checked_at: string | null
          checked_by: string | null
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          name: string
          price: number | null
          quantity: string | null
          store: string | null
        }
        Insert: {
          category?: string | null
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          name: string
          price?: number | null
          quantity?: string | null
          store?: string | null
        }
        Update: {
          category?: string | null
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          name?: string
          price?: number | null
          quantity?: string | null
          store?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "groceries_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groceries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groceries_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      grocery_catalog: {
        Row: {
          category: string | null
          created_at: string
          household_id: string
          id: string
          name: string
          price: number | null
          quantity: string | null
          store: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          household_id: string
          id?: string
          name: string
          price?: number | null
          quantity?: string | null
          store?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          household_id?: string
          id?: string
          name?: string
          price?: number | null
          quantity?: string | null
          store?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grocery_catalog_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      grocery_saved_items: {
        Row: {
          category: string | null
          created_at: string
          id: string
          list_id: string
          name: string
          price: number | null
          quantity: string | null
          store: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          list_id: string
          name: string
          price?: number | null
          quantity?: string | null
          store?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          list_id?: string
          name?: string
          price?: number | null
          quantity?: string | null
          store?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grocery_saved_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "grocery_saved_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      grocery_saved_lists: {
        Row: {
          created_at: string
          household_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "grocery_saved_lists_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_completions: {
        Row: {
          completed: boolean
          count: number
          created_at: string
          date: string
          habit_id: string
          id: string
          note: string | null
        }
        Insert: {
          completed?: boolean
          count?: number
          created_at?: string
          date: string
          habit_id: string
          id?: string
          note?: string | null
        }
        Update: {
          completed?: boolean
          count?: number
          created_at?: string
          date?: string
          habit_id?: string
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "habit_completions_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_reminders_sent: {
        Row: {
          habit_id: string
          id: string
          sent_date: string
        }
        Insert: {
          habit_id: string
          id?: string
          sent_date?: string
        }
        Update: {
          habit_id?: string
          id?: string
          sent_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_reminders_sent_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habits: {
        Row: {
          archived_at: string | null
          color: string | null
          created_at: string
          emoji: string
          frequency: string
          frequency_days: number[] | null
          household_id: string
          id: string
          kind: string
          member_id: string | null
          name: string
          position: number | null
          reminder_time: string | null
          start_date: string | null
          target_count: number
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          emoji?: string
          frequency?: string
          frequency_days?: number[] | null
          household_id: string
          id?: string
          kind?: string
          member_id?: string | null
          name: string
          position?: number | null
          reminder_time?: string | null
          start_date?: string | null
          target_count?: number
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          emoji?: string
          frequency?: string
          frequency_days?: number[] | null
          household_id?: string
          id?: string
          kind?: string
          member_id?: string | null
          name?: string
          position?: number | null
          reminder_time?: string | null
          start_date?: string | null
          target_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "habits_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habits_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          kakebo_objectif_epargne: number | null
          name: string
          note: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kakebo_objectif_epargne?: number | null
          name: string
          note?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kakebo_objectif_epargne?: number | null
          name?: string
          note?: string | null
        }
        Relationships: []
      }
      kakebo_categories: {
        Row: {
          color: string | null
          created_at: string
          household_id: string
          id: string
          monthly_budget: number | null
          name: string
          type: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          household_id: string
          id?: string
          monthly_budget?: number | null
          name: string
          type: string
        }
        Update: {
          color?: string | null
          created_at?: string
          household_id?: string
          id?: string
          monthly_budget?: number | null
          name?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "kakebo_categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      kakebo_entries: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          date: string
          description: string | null
          household_id: string
          id: string
          member_id: string | null
          recurring: boolean
          series_id: string | null
          tags: string[]
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          date: string
          description?: string | null
          household_id: string
          id?: string
          member_id?: string | null
          recurring?: boolean
          series_id?: string | null
          tags?: string[]
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          date?: string
          description?: string | null
          household_id?: string
          id?: string
          member_id?: string | null
          recurring?: boolean
          series_id?: string | null
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "kakebo_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "kakebo_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakebo_entries_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakebo_entries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      kakebo_member_budgets: {
        Row: {
          category_id: string
          household_id: string
          member_id: string
          monthly_budget: number | null
        }
        Insert: {
          category_id: string
          household_id: string
          member_id: string
          monthly_budget?: number | null
        }
        Update: {
          category_id?: string
          household_id?: string
          member_id?: string
          monthly_budget?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kakebo_member_budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "kakebo_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakebo_member_budgets_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kakebo_member_budgets_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      media_files: {
        Row: {
          created_at: string
          description: string | null
          external_url: string | null
          file_path: string | null
          household_id: string
          id: string
          member_id: string | null
          mime_type: string | null
          tags: string[]
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          external_url?: string | null
          file_path?: string | null
          household_id: string
          id?: string
          member_id?: string | null
          mime_type?: string | null
          tags?: string[]
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          external_url?: string | null
          file_path?: string | null
          household_id?: string
          id?: string
          member_id?: string | null
          mime_type?: string | null
          tags?: string[]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_files_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_files_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      media_items: {
        Row: {
          author_director: string | null
          comment: string | null
          created_at: string
          external_url: string | null
          file_path: string | null
          finished_at: string | null
          genre: string | null
          household_id: string
          id: string
          member_id: string | null
          mime_type: string | null
          rating: number | null
          release_year: number | null
          started_at: string | null
          status: string
          title: string
          type: string
        }
        Insert: {
          author_director?: string | null
          comment?: string | null
          created_at?: string
          external_url?: string | null
          file_path?: string | null
          finished_at?: string | null
          genre?: string | null
          household_id: string
          id?: string
          member_id?: string | null
          mime_type?: string | null
          rating?: number | null
          release_year?: number | null
          started_at?: string | null
          status?: string
          title: string
          type: string
        }
        Update: {
          author_director?: string | null
          comment?: string | null
          created_at?: string
          external_url?: string | null
          file_path?: string | null
          finished_at?: string | null
          genre?: string | null
          household_id?: string
          id?: string
          member_id?: string | null
          mime_type?: string | null
          rating?: number | null
          release_year?: number | null
          started_at?: string | null
          status?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_items_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          household_id: string
          ical_token: string
          id: string
          kakebo_objectif_epargne: number | null
          notifications_enabled: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          household_id: string
          ical_token?: string
          id?: string
          kakebo_objectif_epargne?: number | null
          notifications_enabled?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          household_id?: string
          ical_token?: string
          id?: string
          kakebo_objectif_epargne?: number | null
          notifications_enabled?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      moment_comments: {
        Row: {
          created_at: string | null
          id: string
          member_id: string
          moment_id: string
          text: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          member_id: string
          moment_id: string
          text: string
        }
        Update: {
          created_at?: string | null
          id?: string
          member_id?: string
          moment_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "moment_comments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moment_comments_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
        ]
      }
      moment_photos: {
        Row: {
          created_at: string | null
          id: string
          moment_id: string
          photo_path: string
          position: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          moment_id: string
          photo_path: string
          position?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          moment_id?: string
          photo_path?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "moment_photos_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
        ]
      }
      moment_reactions: {
        Row: {
          created_at: string | null
          emoji: string
          id: string
          member_id: string
          moment_id: string
        }
        Insert: {
          created_at?: string | null
          emoji: string
          id?: string
          member_id: string
          moment_id: string
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: string
          member_id?: string
          moment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moment_reactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moment_reactions_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
        ]
      }
      moments: {
        Row: {
          archived_at: string | null
          created_at: string
          household_id: string
          id: string
          member_id: string
          photo_archived: boolean
          photo_path: string | null
          text: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          household_id: string
          id?: string
          member_id: string
          photo_archived?: boolean
          photo_path?: string | null
          text?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          household_id?: string
          id?: string
          member_id?: string
          photo_archived?: boolean
          photo_path?: string | null
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moments_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_items: {
        Row: {
          added_at: string | null
          id: string
          media_file_id: string
          playlist_id: string
          position: number
        }
        Insert: {
          added_at?: string | null
          id?: string
          media_file_id: string
          playlist_id: string
          position?: number
        }
        Update: {
          added_at?: string | null
          id?: string
          media_file_id?: string
          playlist_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "playlist_items_media_file_id_fkey"
            columns: ["media_file_id"]
            isOneToOne: false
            referencedRelation: "media_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_items_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          created_at: string | null
          description: string | null
          household_id: string
          id: string
          member_id: string | null
          name: string
          smart_filters: Json | null
          type: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          household_id: string
          id?: string
          member_id?: string | null
          name: string
          smart_filters?: Json | null
          type?: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          household_id?: string
          id?: string
          member_id?: string | null
          name?: string
          smart_filters?: Json | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlists_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlists_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string
          member_id: string
          p256dh: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string
          member_id: string
          p256dh: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string
          member_id?: string
          p256dh?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_list_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          household_id: string
          id: string
          list_id: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          household_id: string
          id?: string
          list_id?: string | null
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          household_id?: string
          id?: string
          list_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_list_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_list_tokens_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_list_tokens_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "grocery_saved_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_sessions: {
        Row: {
          created_at: string
          done_by: string | null
          household_id: string
          id: string
          item_count: number
          items: Json
          total: number | null
        }
        Insert: {
          created_at?: string
          done_by?: string | null
          household_id: string
          id?: string
          item_count?: number
          items?: Json
          total?: number | null
        }
        Update: {
          created_at?: string
          done_by?: string | null
          household_id?: string
          id?: string
          item_count?: number
          items?: Json
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_sessions_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_sessions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      training_presets: {
        Row: {
          config: Json
          created_at: string
          household_id: string
          id: string
          member_id: string | null
          mode: string
          name: string
        }
        Insert: {
          config?: Json
          created_at?: string
          household_id: string
          id?: string
          member_id?: string | null
          mode: string
          name: string
        }
        Update: {
          config?: Json
          created_at?: string
          household_id?: string
          id?: string
          member_id?: string | null
          mode?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_presets_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_presets_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      training_sessions: {
        Row: {
          completed_at: string
          duration_seconds: number
          focus: string | null
          household_id: string
          id: string
          member_id: string | null
          mode: string
          name: string
        }
        Insert: {
          completed_at?: string
          duration_seconds?: number
          focus?: string | null
          household_id: string
          id?: string
          member_id?: string | null
          mode: string
          name: string
        }
        Update: {
          completed_at?: string
          duration_seconds?: number
          focus?: string | null
          household_id?: string
          id?: string
          member_id?: string | null
          mode?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_sessions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_household_id: { Args: never; Returns: string }
      reorder_habits: { Args: { p_ids: string[] }; Returns: undefined }
      replace_groceries_with_list: {
        Args: { p_household_id: string; p_items: Json; p_member_id: string }
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
    Enums: {},
  },
} as const
