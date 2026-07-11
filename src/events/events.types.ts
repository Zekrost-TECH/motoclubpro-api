export type EventStatus = 'borrador' | 'proximo' | 'en_curso' | 'completado' | 'cancelado';
export type RiderLevel = 'novato' | 'basico' | 'intermedio' | 'avanzado' | 'experto';
export type RideRole = string;
export type InventoryCategory = 'herramienta' | 'seguridad' | 'comida' | 'otros';
export type RouteDifficulty = 'suave' | 'moderada' | 'expertos' | 'off_road' | 'viaje_largo';
export type GuestType = 'acompañante' | 'invitado';

export interface Event {
    id: string;
    title: string;
    description?: string;
    date: Date;
    time: string;
    difficulty: RouteDifficulty;
    route_id?: string;
    status: EventStatus;
    max_attendees?: number;
    min_rider_level: RiderLevel;
    meeting_point?: string;
    meeting_point_lat?: number;
    meeting_point_lng?: number;
    organizer_id: string;
    created_at: Date;
    updated_at: Date;
}

export interface EventAttendee {
    event_id: string;
    user_id: string;
    ride_role: RideRole;
    checklist_completed: boolean;
    confirmed_at?: Date;
}

export interface EventGuest {
    id: string;
    event_id?: string;
    invited_by: string;
    guest_type: GuestType;
    full_name: string;
    phone?: string;
    notes?: string;
    confirmed_at?: string;
    created_at?: string;
}

export interface InventoryItem {
    id: string;
    event_id: string;
    name: string;
    category: InventoryCategory;
    quantity: number;
    assigned_to?: string;
    icon?: string;
    created_at: Date;
}
