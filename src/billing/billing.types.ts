export interface CreateWompiTransactionDto {
  amount_in_cents: number;
  currency: 'COP';
  customer_email: string;
  reference: string;
  payment_method: {
    type: 'CARD' | 'NEQUI' | 'PSE';
    token: string;
  };
  redirect_url?: string;
}

export interface WompiMerchantResponse {
  data: {
    presigned_acceptance: {
      acceptance_token: string;
    };
  };
}

export interface WompiTransactionResponse {
  data: {
    id: string;
    status: string;
    reference: string;
    status_message?: string;
  };
}

export interface WompiWebhookEvent {
  event: string;
  data: {
    transaction: {
      id: string;
      status: string;
      reference: string;
      status_message?: string;
    };
  };
  properties: string[];
  timestamp: number;
  checksum: string;
}

export interface TransactionRow {
  id: string;
  subscription_id: string;
  club_id: string;
  status: string;
  plan_amount_cents: number;
  overage_amount_cents: number;
}

export interface SubscriptionRetryRow {
  retry_count: number;
  status: string;
}

export interface SubscriptionRow {
  id: string;
  current_period_end: Date | null;
  billing_cycle: string;
  plan_id: string;
}

export interface UsageRow {
  member_count: number;
  event_count: number;
  overage_members: number;
}

export interface CountRow {
  count: number;
}

export interface PlanRow {
  max_members: number;
}

export interface OveragePlanRow {
  overage_member_cents: number;
}

export interface CronSubscriptionRow {
  id: string;
  club_id: string;
  plan_id: string;
  current_period_start: Date | null;
  current_period_end: Date | null;
  wompi_customer_email: string;
  wompi_payment_source_id: string;
  wompi_payment_method_type: string | null;
  price_monthly_cents: number;
  overage_member_cents: number;
}

export interface FailedTxRow {
  id: string;
  club_id: string;
  subscription_id: string;
  amount_cents: number;
  wompi_customer_email: string;
  wompi_payment_source_id: string;
}
