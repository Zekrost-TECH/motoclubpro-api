import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateSupportDto, SupportType } from './dto/create-support.dto';
import { ReviewSupportDto } from './dto/review-support.dto';

@Injectable()
export class SupportService {
    constructor(private rawDb: DatabaseService) { }

    async search(lat: number, lng: number, radiusMs: number, type?: SupportType) {
        const isFilterType = !!type;
        const sql = `
      SELECT id, name, type, address, phone, hours, rating, review_count, verified,
             ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng,
             ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS dist_m
      FROM support_points
      WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
        AND ($4::boolean = false OR type::text = $5)
      ORDER BY dist_m
      LIMIT 20;
    `;
        const result = await this.rawDb.query(sql, [lng, lat, radiusMs, isFilterType, type || null]);
        return result.rows;
    }

    async create(userId: string, data: CreateSupportDto) {
        const sql = `
      INSERT INTO support_points (name, type, location, address, phone, hours, added_by, verified)
      VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5, $6, $7, $8, false)
      RETURNING id, name, type, rating, review_count, verified, created_at
    `;
        const { name, type, lng, lat, address, phone, hours } = data;
        const values = [name, type, lng, lat, address || null, phone || null, hours || null, userId];

        const result = await this.rawDb.query(sql, values);
        return result.rows[0];
    }

    async verify(id: string) {
        const sql = `
      UPDATE support_points
      SET verified = true
      WHERE id = $1
      RETURNING id, verified
    `;
        const result = await this.rawDb.query(sql, [id]);
        if (result.rowCount === 0) throw new NotFoundException('Support point not found');
        return result.rows[0];
    }

    async review(id: string, userId: string, data: ReviewSupportDto) {
        // Basic review system incrementing total reviews and calculating new average incrementally
        const sql = `
      UPDATE support_points
      SET 
        rating = ((rating * review_count) + $1) / (review_count + 1),
        review_count = review_count + 1
      WHERE id = $2
      RETURNING id, rating, review_count
    `;
        const result = await this.rawDb.query(sql, [data.rating, id]);
        if (result.rowCount === 0) throw new NotFoundException('Support point not found');
        return result.rows[0];
    }
}
