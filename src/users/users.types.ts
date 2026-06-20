export enum UserRole {
    admin = 'admin',
    lider = 'lider',
    piloto = 'piloto'
}

export interface User {
    id: string;
    name: string;
    nickname?: string;
    email: string;
    phone?: string;
    avatarInitials?: string;
    role: UserRole;
    riderLevel: string;
    passwordHash: string;
    bloodType?: string;
    allergies?: string[];
    medicalConditions?: string[];
    ecName?: string;
    ecPhone?: string;
    ecRelationship?: string;
    ridesCompleted?: number;
    totalKm?: number;
    joinDate: Date;
    isActive: boolean;
}