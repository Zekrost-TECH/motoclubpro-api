export enum AlertType {
    PINCHAZO = 'pinchazo',
    SIN_GASOLINA = 'sin_gasolina',
    FALLA_MECANICA = 'falla_mecanica',
    ACCIDENTE = 'accidente',
    MEDICA = 'medica',
    OTRO = 'otro',
}

export enum AlertStatus {
    ACTIVA = 'activa',
    RESUELTA = 'resuelta',
    CANCELADA = 'cancelada',
}

export interface SosAlertRow {
    id: string;
    user_id: string;
    user_name?: string;
    event_id?: string;
    club_id?: string;
    type: AlertType;
    status: AlertStatus;
    description?: string;
    resolved_by?: string;
    created_at: string;
    resolved_at?: string;
    lat: number;
    lng: number;
}

export interface SosAlertSummary {
    id: string;
    type: AlertType;
    status: AlertStatus;
    created_at: string;
}
