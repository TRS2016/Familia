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
      chore_assignments: {
        Row: {
          chore_id: string
          created_at: string
          date: string
          household_id: string
          id: string
          member_id: string | null
          status: string
          steps_done: number[]
        }
        Insert: {
          chore_id: string
          created_at?: string
          date: string
          household_id: string
          id?: string
          member_id?: string | null
          status?: string
          steps_done?: number[]
        }
        Update: {
          chore_id?: string
          created_at?: string
          date?: string
          household_id?: string
          id?: string
          member_id?: string | null
          status?: string
          steps_done?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "chore_assignments_chore_id_fkey"
            columns: ["chore_id"]
            isOneToOne: false
            referencedRelation: "chores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_assignments_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_assignments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      chore_dislikes: {
        Row: {
          chore_id: string
          created_at: string
          household_id: string
          id: string
          member_id: string
        }
        Insert: {
          chore_id: string
          created_at?: string
          household_id: string
          id?: string
          member_id: string
        }
        Update: {
          chore_id?: string
          created_at?: string
          household_id?: string
          id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chore_dislikes_chore_id_fkey"
            columns: ["chore_id"]
            isOneToOne: false
            referencedRelation: "chores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_dislikes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_dislikes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      chore_feedback: {
        Row: {
          chore_id: string | null
          created_at: string
          household_id: string
          id: string
          log_id: string | null
          member_id: string
          verdict: string
        }
        Insert: {
          chore_id?: string | null
          created_at?: string
          household_id: string
          id?: string
          log_id?: string | null
          member_id: string
          verdict: string
        }
        Update: {
          chore_id?: string | null
          created_at?: string
          household_id?: string
          id?: string
          log_id?: string | null
          member_id?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "chore_feedback_chore_id_fkey"
            columns: ["chore_id"]
            isOneToOne: false
            referencedRelation: "chores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_feedback_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_feedback_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "chore_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_feedback_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      chore_logs: {
        Row: {
          assignment_id: string | null
          category: string | null
          chore_id: string | null
          created_at: string
          done_on: string
          household_id: string
          id: string
          label: string | null
          member_id: string
          mental_load: boolean
          note: string | null
          photo_path: string | null
          points_awarded: number
        }
        Insert: {
          assignment_id?: string | null
          category?: string | null
          chore_id?: string | null
          created_at?: string
          done_on?: string
          household_id: string
          id?: string
          label?: string | null
          member_id: string
          mental_load?: boolean
          note?: string | null
          photo_path?: string | null
          points_awarded?: number
        }
        Update: {
          assignment_id?: string | null
          category?: string | null
          chore_id?: string | null
          created_at?: string
          done_on?: string
          household_id?: string
          id?: string
          label?: string | null
          member_id?: string
          mental_load?: boolean
          note?: string | null
          photo_path?: string | null
          points_awarded?: number
        }
        Relationships: [
          {
            foreignKeyName: "chore_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "chore_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_logs_chore_id_fkey"
            columns: ["chore_id"]
            isOneToOne: false
            referencedRelation: "chores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_logs_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_logs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      chore_reminders_sent: {
        Row: {
          assignment_id: string
          id: string
          sent_date: string
        }
        Insert: {
          assignment_id: string
          id?: string
          sent_date?: string
        }
        Update: {
          assignment_id?: string
          id?: string
          sent_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "chore_reminders_sent_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "chore_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      chore_thanks: {
        Row: {
          created_at: string
          from_member: string
          household_id: string
          id: string
          log_id: string | null
          to_member: string
        }
        Insert: {
          created_at?: string
          from_member: string
          household_id: string
          id?: string
          log_id?: string | null
          to_member: string
        }
        Update: {
          created_at?: string
          from_member?: string
          household_id?: string
          id?: string
          log_id?: string | null
          to_member?: string
        }
        Relationships: [
          {
            foreignKeyName: "chore_thanks_from_member_fkey"
            columns: ["from_member"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_thanks_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_thanks_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "chore_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_thanks_to_member_fkey"
            columns: ["to_member"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      chores: {
        Row: {
          category: string
          color: string | null
          created_at: string
          default_member_id: string | null
          emoji: string
          frequency: string
          frequency_days: number[] | null
          household_id: string
          id: string
          instructions: string | null
          mental_load: boolean
          name: string
          points: number
          position: number | null
          recipe_id: string | null
          rotation_member_ids: string[] | null
          rotation_period: string
          start_date: string | null
          steps: string[]
        }
        Insert: {
          category?: string
          color?: string | null
          created_at?: string
          default_member_id?: string | null
          emoji?: string
          frequency?: string
          frequency_days?: number[] | null
          household_id: string
          id?: string
          instructions?: string | null
          mental_load?: boolean
          name: string
          points?: number
          position?: number | null
          recipe_id?: string | null
          rotation_member_ids?: string[] | null
          rotation_period?: string
          start_date?: string | null
          steps?: string[]
        }
        Update: {
          category?: string
          color?: string | null
          created_at?: string
          default_member_id?: string | null
          emoji?: string
          frequency?: string
          frequency_days?: number[] | null
          household_id?: string
          id?: string
          instructions?: string | null
          mental_load?: boolean
          name?: string
          points?: number
          position?: number | null
          recipe_id?: string | null
          rotation_member_ids?: string[] | null
          rotation_period?: string
          start_date?: string | null
          steps?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "chores_default_member_id_fkey"
            columns: ["default_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chores_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chores_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      event_reminders_sent: {
        Row: {
          event_id: string
          id: string
          reminded_at: string | null
          trigger_at: string | null
        }
        Insert: {
          event_id: string
          id?: string
          reminded_at?: string | null
          trigger_at?: string | null
        }
        Update: {
          event_id?: string
          id?: string
          reminded_at?: string | null
          trigger_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_reminders_sent_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
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
      family_goals: {
        Row: {
          active: boolean
          created_at: string
          household_id: string
          id: string
          label: string
          period: string
          period_start: string
          reward_text: string | null
          target_points: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          household_id: string
          id?: string
          label: string
          period?: string
          period_start?: string
          reward_text?: string | null
          target_points: number
        }
        Update: {
          active?: boolean
          created_at?: string
          household_id?: string
          id?: string
          label?: string
          period?: string
          period_start?: string
          reward_text?: string | null
          target_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "family_goals_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
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
      household_rules: {
        Row: {
          action: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          emoji: string
          household_id: string
          id: string
          points: number
          position: number
          priority: number
          proposed_by: string | null
          replaces_rule_id: string | null
          status: string
          text: string
        }
        Insert: {
          action?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          emoji?: string
          household_id: string
          id?: string
          points?: number
          position?: number
          priority?: number
          proposed_by?: string | null
          replaces_rule_id?: string | null
          status?: string
          text: string
        }
        Update: {
          action?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          emoji?: string
          household_id?: string
          id?: string
          points?: number
          position?: number
          priority?: number
          proposed_by?: string | null
          replaces_rule_id?: string | null
          status?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_rules_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_rules_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_rules_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_rules_replaces_rule_id_fkey"
            columns: ["replaces_rule_id"]
            isOneToOne: false
            referencedRelation: "household_rules"
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
      kakebo_budget_alerts_sent: {
        Row: {
          created_at: string
          household_id: string
          id: string
          period: string
          scope_key: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          period: string
          scope_key: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          period?: string
          scope_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "kakebo_budget_alerts_sent_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
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
          saving_goal_id: string | null
          series_end: string | null
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
          saving_goal_id?: string | null
          series_end?: string | null
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
          saving_goal_id?: string | null
          series_end?: string | null
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
          {
            foreignKeyName: "kakebo_entries_saving_goal_id_fkey"
            columns: ["saving_goal_id"]
            isOneToOne: false
            referencedRelation: "kakebo_saving_goals"
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
      kakebo_saving_goals: {
        Row: {
          archived_at: string | null
          created_at: string
          emoji: string
          household_id: string
          id: string
          name: string
          target_amount: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          emoji?: string
          household_id: string
          id?: string
          name: string
          target_amount: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          emoji?: string
          household_id?: string
          id?: string
          name?: string
          target_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "kakebo_saving_goals_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      kakebo_series_skips: {
        Row: {
          created_at: string
          date: string
          household_id: string
          series_id: string
        }
        Insert: {
          created_at?: string
          date: string
          household_id: string
          series_id: string
        }
        Update: {
          created_at?: string
          date?: string
          household_id?: string
          series_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kakebo_series_skips_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      lecteur_dj_lock: {
        Row: {
          device_id: string
          heartbeat_at: string
          household_id: string
          member_id: string | null
        }
        Insert: {
          device_id: string
          heartbeat_at?: string
          household_id: string
          member_id?: string | null
        }
        Update: {
          device_id?: string
          heartbeat_at?: string
          household_id?: string
          member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lecteur_dj_lock_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lecteur_dj_lock_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      lecteur_now_playing: {
        Row: {
          household_id: string
          queue_item_id: string | null
          requested_by: string | null
          title: string
          updated_at: string
        }
        Insert: {
          household_id: string
          queue_item_id?: string | null
          requested_by?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          household_id?: string
          queue_item_id?: string | null
          requested_by?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lecteur_now_playing_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      lecteur_party_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          household_id: string
          id: string
          moderated: boolean
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          household_id: string
          id?: string
          moderated?: boolean
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          household_id?: string
          id?: string
          moderated?: boolean
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "lecteur_party_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lecteur_party_tokens_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      lecteur_queue: {
        Row: {
          added_by: string | null
          approved: boolean
          created_at: string
          guest_name: string | null
          household_id: string
          id: string
          media_file_id: string
          played: boolean
          position: number
          votes: number
        }
        Insert: {
          added_by?: string | null
          approved?: boolean
          created_at?: string
          guest_name?: string | null
          household_id: string
          id?: string
          media_file_id: string
          played?: boolean
          position?: number
          votes?: number
        }
        Update: {
          added_by?: string | null
          approved?: boolean
          created_at?: string
          guest_name?: string | null
          household_id?: string
          id?: string
          media_file_id?: string
          played?: boolean
          position?: number
          votes?: number
        }
        Relationships: [
          {
            foreignKeyName: "lecteur_queue_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lecteur_queue_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lecteur_queue_media_file_id_fkey"
            columns: ["media_file_id"]
            isOneToOne: false
            referencedRelation: "media_files"
            referencedColumns: ["id"]
          },
        ]
      }
      lecteur_queue_votes: {
        Row: {
          created_at: string
          queue_item_id: string
          voter_key: string
        }
        Insert: {
          created_at?: string
          queue_item_id: string
          voter_key: string
        }
        Update: {
          created_at?: string
          queue_item_id?: string
          voter_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "lecteur_queue_votes_queue_item_id_fkey"
            columns: ["queue_item_id"]
            isOneToOne: false
            referencedRelation: "lecteur_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_entries: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          household_id: string
          id: string
          meal_type: string
          recipe_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          household_id: string
          id?: string
          meal_type: string
          recipe_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          household_id?: string
          id?: string
          meal_type?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_entries_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_entries_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      media_files: {
        Row: {
          created_at: string
          description: string | null
          duration_seconds: number | null
          external_url: string | null
          file_path: string | null
          household_id: string
          id: string
          is_favorite: boolean
          member_id: string | null
          mime_type: string | null
          party_hidden: boolean
          play_count: number
          tags: string[]
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          external_url?: string | null
          file_path?: string | null
          household_id: string
          id?: string
          is_favorite?: boolean
          member_id?: string | null
          mime_type?: string | null
          party_hidden?: boolean
          play_count?: number
          tags?: string[]
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          external_url?: string | null
          file_path?: string | null
          household_id?: string
          id?: string
          is_favorite?: boolean
          member_id?: string | null
          mime_type?: string | null
          party_hidden?: boolean
          play_count?: number
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
          created_at: string
          external_url: string | null
          file_path: string | null
          finished_at: string | null
          genre: string | null
          household_id: string
          id: string
          member_id: string | null
          mime_type: string | null
          release_year: number | null
          started_at: string | null
          status: string
          title: string
          type: string
        }
        Insert: {
          author_director?: string | null
          created_at?: string
          external_url?: string | null
          file_path?: string | null
          finished_at?: string | null
          genre?: string | null
          household_id: string
          id?: string
          member_id?: string | null
          mime_type?: string | null
          release_year?: number | null
          started_at?: string | null
          status?: string
          title: string
          type: string
        }
        Update: {
          author_director?: string | null
          created_at?: string
          external_url?: string | null
          file_path?: string | null
          finished_at?: string | null
          genre?: string | null
          household_id?: string
          id?: string
          member_id?: string | null
          mime_type?: string | null
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
      media_ratings: {
        Row: {
          comment: string | null
          household_id: string
          id: string
          media_item_id: string
          member_id: string
          rating: number | null
          updated_at: string
        }
        Insert: {
          comment?: string | null
          household_id: string
          id?: string
          media_item_id: string
          member_id: string
          rating?: number | null
          updated_at?: string
        }
        Update: {
          comment?: string | null
          household_id?: string
          id?: string
          media_item_id?: string
          member_id?: string
          rating?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_ratings_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_ratings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      member_achievements: {
        Row: {
          achievement_key: string
          household_id: string
          id: string
          member_id: string
          unlocked_at: string
        }
        Insert: {
          achievement_key: string
          household_id: string
          id?: string
          member_id: string
          unlocked_at?: string
        }
        Update: {
          achievement_key?: string
          household_id?: string
          id?: string
          member_id?: string
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_achievements_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_achievements_member_id_fkey"
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
          caption: string | null
          created_at: string | null
          id: string
          moment_id: string
          photo_path: string
          position: number
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          id?: string
          moment_id: string
          photo_path: string
          position?: number
        }
        Update: {
          caption?: string | null
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
          pinned: boolean
          text: string | null
          video_mime: string | null
          video_path: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          household_id: string
          id?: string
          member_id: string
          photo_archived?: boolean
          photo_path?: string | null
          pinned?: boolean
          text?: string | null
          video_mime?: string | null
          video_path?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          household_id?: string
          id?: string
          member_id?: string
          photo_archived?: boolean
          photo_path?: string | null
          pinned?: boolean
          text?: string | null
          video_mime?: string | null
          video_path?: string | null
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
      point_events: {
        Row: {
          created_at: string
          household_id: string
          id: string
          member_id: string
          points: number
          reason: string
          ref_id: string | null
          ref_type: string | null
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          member_id: string
          points: number
          reason?: string
          ref_id?: string | null
          ref_type?: string | null
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          member_id?: string
          points?: number
          reason?: string
          ref_id?: string | null
          ref_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "point_events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_events_member_id_fkey"
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
      recipes: {
        Row: {
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          ingredients: Json
          meal_type: string
          points: number
          steps: Json
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          ingredients?: Json
          meal_type: string
          points?: number
          steps?: Json
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          ingredients?: Json
          meal_type?: string
          points?: number
          steps?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_redemptions: {
        Row: {
          cost_points: number
          created_at: string
          household_id: string
          id: string
          label: string
          member_id: string
          resolved_at: string | null
          reward_id: string | null
          status: string
        }
        Insert: {
          cost_points: number
          created_at?: string
          household_id: string
          id?: string
          label: string
          member_id: string
          resolved_at?: string | null
          reward_id?: string | null
          status?: string
        }
        Update: {
          cost_points?: number
          created_at?: string
          household_id?: string
          id?: string
          label?: string
          member_id?: string
          resolved_at?: string | null
          reward_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_redemptions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          active: boolean
          cost_points: number
          created_at: string
          emoji: string
          household_id: string
          id: string
          member_id: string | null
          name: string
        }
        Insert: {
          active?: boolean
          cost_points: number
          created_at?: string
          emoji?: string
          household_id: string
          id?: string
          member_id?: string | null
          name: string
        }
        Update: {
          active?: boolean
          cost_points?: number
          created_at?: string
          emoji?: string
          household_id?: string
          id?: string
          member_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "rewards_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rewards_member_id_fkey"
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
          position: number | null
        }
        Insert: {
          config?: Json
          created_at?: string
          household_id: string
          id?: string
          member_id?: string | null
          mode: string
          name: string
          position?: number | null
        }
        Update: {
          config?: Json
          created_at?: string
          household_id?: string
          id?: string
          member_id?: string | null
          mode?: string
          name?: string
          position?: number | null
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
          rounds: number | null
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
          rounds?: number | null
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
          rounds?: number | null
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
      velov_favorites: {
        Row: {
          created_at: string
          household_id: string
          id: string
          member_id: string
          station_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          member_id: string
          station_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          member_id?: string
          station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "velov_favorites_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      yt_search_cache: {
        Row: {
          created_at: string
          q: string
          results: Json
        }
        Insert: {
          created_at?: string
          q: string
          results: Json
        }
        Update: {
          created_at?: string
          q?: string
          results?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      chore_counts_by_category: {
        Args: never
        Returns: {
          category: string
          cnt: number
          member_id: string
        }[]
      }
      claim_lecteur_dj: {
        Args: {
          p_device: string
          p_household: string
          p_stale_seconds?: number
        }
        Returns: boolean
      }
      get_my_household_id: { Args: never; Returns: string }
      increment_media_play: { Args: { p_file_id: string }; Returns: undefined }
      kakebo_saving_goal_totals: {
        Args: { p_household_id: string }
        Returns: {
          saving_goal_id: string
          total: number
        }[]
      }
      log_chore: {
        Args: {
          p_assignment_id: string
          p_chore_id: string
          p_done_on: string
          p_label: string
          p_member_id: string
          p_note: string
          p_points?: number
        }
        Returns: string
      }
      member_point_totals: {
        Args: never
        Returns: {
          member_id: string
          total: number
        }[]
      }
      member_points_by_week: {
        Args: { p_since: string }
        Returns: {
          member_id: string
          total: number
          week_start: string
        }[]
      }
      member_points_since: {
        Args: { p_start: string }
        Returns: {
          member_id: string
          total: number
        }[]
      }
      move_saved_item: {
        Args: { p_item: string; p_to_list: string }
        Returns: undefined
      }
      redeem_reward: { Args: { p_reward_id: string }; Returns: string }
      release_lecteur_dj: {
        Args: { p_device: string; p_household: string }
        Returns: undefined
      }
      reorder_chores: { Args: { p_ids: string[] }; Returns: undefined }
      reorder_habits: { Args: { p_ids: string[] }; Returns: undefined }
      reorder_training_presets: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      replace_grocery_catalog: { Args: { p_rows: Json }; Returns: number }
      reset_chores_data: { Args: never; Returns: undefined }
      resolve_redemption: {
        Args: { p_redemption_id: string; p_status: string }
        Returns: undefined
      }
      save_grocery_list: {
        Args: { p_items: Json; p_name: string }
        Returns: string
      }
      sort_lecteur_queue_by_votes: {
        Args: { p_household: string }
        Returns: undefined
      }
      spendable_balance: { Args: { p_member_id: string }; Returns: number }
      swap_lecteur_queue_position: {
        Args: { a: string; b: string }
        Returns: undefined
      }
      swap_playlist_item_position: {
        Args: { a: string; b: string }
        Returns: undefined
      }
      undo_chore_log: { Args: { p_log_id: string }; Returns: undefined }
      vote_lecteur_queue: {
        Args: { p_item_id: string; p_voter_key?: string }
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
