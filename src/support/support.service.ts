import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateSupportDto, SupportType } from './dto/create-support.dto';
import { UpdateSupportDto } from './dto/update-support.dto';
import { ReviewSupportDto } from './dto/review-support.dto';

export interface SupportPointRow {
  id: string;
  name: string;
  type: string;
  city?: string;
  address?: string;
  phone?: string;
  hours?: string;
  rating: number;
  review_count: number;
  verified: boolean;
  lat: number;
  lng: number;
  dist_m: number;
}

export interface SupportPointSummary {
  id: string;
  name: string;
  type: string;
  rating: number;
  review_count: number;
  verified: boolean;
  created_at: string;
}

export interface SupportPointVerify {
  id: string;
  verified: boolean;
}

export interface SupportPointReview {
  id: string;
  rating: number;
  review_count: number;
}

@Injectable()
export class SupportService {
  constructor(private rawDb: DatabaseService) { }

  async findAll(clubId?: string): Promise<SupportPointRow[]> {
    let sql = `
      SELECT id, name, type, city, address, phone, hours, rating, review_count, verified,
             ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng,
             0 AS dist_m
      FROM support_points
      WHERE 1=1`;
    const params: (string | null)[] = [];
    if (clubId) {
      sql += ' AND club_id = $1';
      params.push(clubId);
    }
    sql += ' ORDER BY name LIMIT 100;';
    const result = await this.rawDb.query<SupportPointRow>(sql, params);
    return result.rows;
  }

  async search(lat: number, lng: number, radiusMs: number, type?: SupportType, clubId?: string): Promise<SupportPointRow[]> {
    const isFilterType = !!type;
    let sql = `
      SELECT id, name, type, city, address, phone, hours, rating, review_count, verified,
             ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng,
             ST_Distance(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS dist_m
      FROM support_points
      WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
        AND ($4::boolean = false OR type::text = $5)`;
    const params: (number | boolean | string | null)[] = [lng, lat, radiusMs, isFilterType, type || null];

    if (clubId) {
      sql += ' AND club_id = $6';
      params.push(clubId);
    }
    sql += `
      ORDER BY dist_m
      LIMIT 20;
    `;
    const result = await this.rawDb.query<SupportPointRow>(sql, params);
    return result.rows;
  }

  async findOne(id: string, clubId?: string): Promise<SupportPointRow> {
    let sql = `
      SELECT id, name, type, city, address, phone, hours, rating, review_count, verified,
             ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng,
             0 AS dist_m
      FROM support_points
      WHERE id = $1`;
    const params: (string | null)[] = [id];
    if (clubId) {
      sql += ' AND club_id = $2';
      params.push(clubId);
    }
    const result = await this.rawDb.query<SupportPointRow>(sql, params);
    if (result.rowCount === 0) throw new NotFoundException('Support point not found');
    return result.rows[0];
  }

  async create(userId: string, data: CreateSupportDto, clubId?: string): Promise<SupportPointSummary> {
    const sql = `
      INSERT INTO support_points (name, type, city, location, address, phone, hours, added_by, club_id, verified)
      VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6, $7, $8, $9, $10, false)
      RETURNING id, name, type, city, rating, review_count, verified, created_at
    `;
    const { name, type, city, lng, lat, address, phone, hours } = data;
    const values = [name, type, city || null, lng, lat, address || null, phone || null, hours || null, userId, clubId || null];

    const result = await this.rawDb.query<SupportPointSummary>(sql, values);
    return result.rows[0];
  }

  async update(id: string, data: UpdateSupportDto, clubId?: string): Promise<SupportPointSummary> {
    const setFields: string[] = [];
    const values: (string | number | null)[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      setFields.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.type !== undefined) {
      setFields.push(`type = $${paramIndex++}`);
      values.push(data.type);
    }
    if (data.city !== undefined) {
      setFields.push(`city = $${paramIndex++}`);
      values.push(data.city || null);
    }
    if (data.address !== undefined) {
      setFields.push(`address = $${paramIndex++}`);
      values.push(data.address || null);
    }
    if (data.phone !== undefined) {
      setFields.push(`phone = $${paramIndex++}`);
      values.push(data.phone || null);
    }
    if (data.hours !== undefined) {
      setFields.push(`hours = $${paramIndex++}`);
      values.push(data.hours || null);
    }
    if (data.lat !== undefined && data.lng !== undefined) {
      setFields.push(`location = ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326)::geography`);
      values.push(data.lng, data.lat);
    }

    if (setFields.length === 0) {
      return this.findOne(id, clubId) as unknown as SupportPointSummary;
    }

    let sql = `
      UPDATE support_points
      SET ${setFields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex++}`;
    values.push(id);
    if (clubId) {
      sql += ` AND club_id = $${paramIndex++}`;
      values.push(clubId);
    }
    sql += `
      RETURNING id, name, type, city, rating, review_count, verified, created_at
    `;

    const result = await this.rawDb.query<SupportPointSummary>(sql, values);
    if (result.rowCount === 0) throw new NotFoundException('Support point not found');
    return result.rows[0];
  }

  async verify(id: string, verified: boolean, clubId?: string): Promise<SupportPointVerify> {
    let sql = `
      UPDATE support_points
      SET verified = $1
      WHERE id = $2`;
    const params: (boolean | string | null)[] = [verified, id];
    if (clubId) {
      sql += ' AND club_id = $3';
      params.push(clubId);
    }
    sql += `
      RETURNING id, verified
    `;
    const result = await this.rawDb.query<SupportPointVerify>(sql, params);
    if (result.rowCount === 0) throw new NotFoundException('Support point not found');
    return result.rows[0];
  }

  async review(id: string, userId: string, data: ReviewSupportDto, clubId?: string): Promise<SupportPointReview> {
    let sql = `
      UPDATE support_points
      SET
        rating = ((rating * review_count) + $1) / (review_count + 1),
        review_count = review_count + 1
      WHERE id = $2`;
    const params: (number | string | null)[] = [data.rating, id];
    if (clubId) {
      sql += ' AND club_id = $3';
      params.push(clubId);
    }
    sql += `
      RETURNING id, rating, review_count
    `;
    const result = await this.rawDb.query<SupportPointReview>(sql, params);
    if (result.rowCount === 0) throw new NotFoundException('Support point not found');
    return result.rows[0];
  }
}
