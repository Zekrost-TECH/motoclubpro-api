export enum RouteDifficulty {
    SUAVE = 'suave',
    MODERADA = 'moderada',
    EXPERTOS = 'expertos',
    OFF_ROAD = 'off_road',
    VIAJE_LARGO = 'viaje_largo'
}

export enum WaypointType {
    INICIO = 'inicio',
    DESTINO = 'destino',
    PARADA = 'parada',
    GASOLINERA = 'gasolinera',
    RESTAURANTE = 'restaurante'
}

export interface Route {
    id: string;
    name: string;
    description?: string;
    difficulty: RouteDifficulty;
    distanceKm?: number;
    estimatedTime?: string;
    elevationMin?: number;
    elevationMax?: number;
    geojson?: any;
    createdBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface Waypoint {
    id: string;
    routeId: string;
    name?: string;
    // Location handled by PostGIS GeoJSON, we return it as GeoJSON coordinates
    location: any;
    type: WaypointType;
    estimatedArrival?: string;
    notes?: string;
    sortOrder: number;
}
