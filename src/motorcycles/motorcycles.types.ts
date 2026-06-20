export enum MaintenanceType {
    ACEITE = 'aceite',
    LLANTAS = 'llantas',
    CADENA = 'cadena',
    FRENOS = 'frenos',
    FILTROS = 'filtros',
    REVISION_GENERAL = 'revision_general',
    OTRO = 'otro'
}

export interface Motorcycle {
    id: string;
    userId: string;
    brand: string;
    model: string;
    year: number;
    cc?: number;
    plate: string;
    color?: string;
    currentKm: number;
    nextServiceKm?: number;
    soatExpiry?: Date;
    techReviewExpiry?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface MaintenanceRecord {
    id: string;
    motorcycleId: string;
    type: MaintenanceType;
    description?: string;
    km: number;
    date: Date;
    cost?: number;
    receiptUrl?: string;
    createdAt: Date;
}
