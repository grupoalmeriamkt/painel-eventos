/**
 * Tipos da API v4 do Kommo (subconjunto usado pelo painel).
 * Docs: https://developers.kommo.com/reference
 */

export interface KommoLinks {
  _links?: { next?: { href: string }; self?: { href: string } };
}

export interface KommoCustomFieldValue {
  field_id: number;
  field_name?: string;
  field_code?: string | null;
  field_type?: string;
  values: { value: string | number | boolean | null; enum_id?: number; enum_code?: string }[];
}

export interface KommoLead {
  id: number;
  name: string | null;
  price: number | null;
  responsible_user_id: number | null;
  status_id: number;
  pipeline_id: number;
  created_at: number; // epoch seconds
  updated_at: number; // epoch seconds
  closed_at: number | null;
  closest_task_at?: number | null;
  is_deleted?: boolean;
  custom_fields_values: KommoCustomFieldValue[] | null;
  _embedded?: {
    tags?: { id: number; name: string }[];
  };
}

export interface KommoPipelineStatus {
  id: number;
  name: string;
  sort: number;
  is_editable: boolean;
  pipeline_id: number;
  type?: number; // 0 normal, 1 won? — usado só como dica
}

export interface KommoPipeline {
  id: number;
  name: string;
  sort: number;
  is_main: boolean;
  _embedded?: { statuses?: KommoPipelineStatus[] };
}

export interface KommoUser {
  id: number;
  name: string;
  email?: string;
}

export interface KommoCustomFieldDef {
  id: number;
  name: string;
  code?: string | null;
  type: string; // text, numeric, date, date_time, select, multiselect, ...
  enums?: { id: number; value: string; sort: number }[] | null;
}

export interface KommoCollection<T> extends KommoLinks {
  _page?: number;
  _embedded?: Record<string, T[]>;
}
