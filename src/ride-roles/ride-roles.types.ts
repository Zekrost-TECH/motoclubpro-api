export interface ClubRideRole {
    id: string;
    club_id: string;
    slug: string;
    name: string;
    is_unique: boolean;
    sort_order: number;
    created_at: Date;
    updated_at: Date;
}
