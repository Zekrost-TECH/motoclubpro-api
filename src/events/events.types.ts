export type EventStatus = 'borrador' | 'proximo' | 'en_curso' | 'completado' | 'cancelado';
export type RiderLevel = 'novato' | 'basico' | 'intermedio' | 'avanzado' | 'experto';
export type RideRole = 'puntero' | 'barredora' | 'capitan_ruta' | 'bloqueador' | 'cierre_seguridad' | 'jefe_armas' | 'primeros_auxilios' | 'coordinador_logistico' | 'comunicador' | 'rider';
export type InventoryCategory = 'herramienta' | 'seguridad' | 'comida' | 'otros';
export type RouteDifficulty = 'suave' | 'moderada' | 'expertos' | 'off_road' | 'viaje_largo';

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
