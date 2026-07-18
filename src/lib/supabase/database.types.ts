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
      grocery_items: {
        Row: {
          category: string | null
          created_at: string
          display_text: string
          id: string
          is_completed: boolean
          list_id: string
          quantity: string | null
          sort_order: number
          source_ingredient_id: string | null
          source_recipe_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          display_text: string
          id?: string
          is_completed?: boolean
          list_id: string
          quantity?: string | null
          sort_order?: number
          source_ingredient_id?: string | null
          source_recipe_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          display_text?: string
          id?: string
          is_completed?: boolean
          list_id?: string
          quantity?: string | null
          sort_order?: number
          source_ingredient_id?: string | null
          source_recipe_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grocery_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "grocery_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grocery_items_source_ingredient_id_fkey"
            columns: ["source_ingredient_id"]
            isOneToOne: false
            referencedRelation: "recipe_ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grocery_items_source_recipe_id_fkey"
            columns: ["source_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      grocery_lists: {
        Row: {
          created_at: string
          id: string
          name: string
          source_recipe_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          source_recipe_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          source_recipe_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grocery_lists_source_recipe_id_fkey"
            columns: ["source_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      import_limit_exemptions: {
        Row: {
          created_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      recipe_imports: {
        Row: {
          created_at: string
          error: string | null
          estimated_cost_cents: number
          extracted: Json | null
          id: string
          media_url: string | null
          method: string | null
          recipe_id: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          source_url: string | null
          status: Database["public"]["Enums"]["import_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          estimated_cost_cents?: number
          extracted?: Json | null
          id?: string
          media_url?: string | null
          method?: string | null
          recipe_id?: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          source_url?: string | null
          status: Database["public"]["Enums"]["import_status"]
          user_id?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          estimated_cost_cents?: number
          extracted?: Json | null
          id?: string
          media_url?: string | null
          method?: string | null
          recipe_id?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          source_url?: string | null
          status?: Database["public"]["Enums"]["import_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_imports_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredient_groups: {
        Row: {
          id: string
          name: string | null
          optional: boolean
          position: number
          recipe_id: string
        }
        Insert: {
          id?: string
          name?: string | null
          optional?: boolean
          position?: number
          recipe_id: string
        }
        Update: {
          id?: string
          name?: string | null
          optional?: boolean
          position?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredient_groups_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          alternative_group: string | null
          display_text: string
          group_id: string | null
          id: string
          name: string | null
          optional: boolean
          preparation: string | null
          quantity: string | null
          quantity_max: number | null
          quantity_min: number | null
          quantity_value: number | null
          recipe_id: string
          sort_order: number
          unit: string | null
        }
        Insert: {
          alternative_group?: string | null
          display_text: string
          group_id?: string | null
          id?: string
          name?: string | null
          optional?: boolean
          preparation?: string | null
          quantity?: string | null
          quantity_max?: number | null
          quantity_min?: number | null
          quantity_value?: number | null
          recipe_id: string
          sort_order?: number
          unit?: string | null
        }
        Update: {
          alternative_group?: string | null
          display_text?: string
          group_id?: string | null
          id?: string
          name?: string | null
          optional?: boolean
          preparation?: string | null
          quantity?: string | null
          quantity_max?: number | null
          quantity_min?: number | null
          quantity_value?: number | null
          recipe_id?: string
          sort_order?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "recipe_ingredient_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_steps: {
        Row: {
          id: string
          image_path: string | null
          instruction: string
          recipe_id: string
          sort_order: number
          title: string | null
        }
        Insert: {
          id?: string
          image_path?: string | null
          instruction: string
          recipe_id: string
          sort_order?: number
          title?: string | null
        }
        Update: {
          id?: string
          image_path?: string | null
          instruction?: string
          recipe_id?: string
          sort_order?: number
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_tips: {
        Row: {
          id: string
          recipe_id: string
          sort_order: number
          text: string
        }
        Insert: {
          id?: string
          recipe_id: string
          sort_order?: number
          text: string
        }
        Update: {
          id?: string
          recipe_id?: string
          sort_order?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_tips_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          cook_time: string | null
          cover_image_path: string | null
          created_at: string
          description: string | null
          id: string
          is_favourite: boolean
          prep_time: string | null
          servings: string | null
          source_handle: string | null
          source_type: Database["public"]["Enums"]["source_type"]
          source_url: string | null
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cook_time?: string | null
          cover_image_path?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_favourite?: boolean
          prep_time?: string | null
          servings?: string | null
          source_handle?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          source_url?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          cook_time?: string | null
          cover_image_path?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_favourite?: boolean
          prep_time?: string | null
          servings?: string | null
          source_handle?: string | null
          source_type?: Database["public"]["Enums"]["source_type"]
          source_url?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      imports_since: { Args: { cutoff: string }; Returns: number }
      owns_list: { Args: { lid: string }; Returns: boolean }
      owns_recipe: { Args: { rid: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      import_status: "success" | "no_recipe" | "failed"
      source_type: "manual" | "instagram" | "website"
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
      import_status: ["success", "no_recipe", "failed"],
      source_type: ["manual", "instagram", "website"],
    },
  },
} as const

