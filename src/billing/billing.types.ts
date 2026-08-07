export interface CreateWompiTransactionDto {
  amount_in_cents: number;
  currency: 'COP';
  customer_email: string;
  reference: string;
  payment_method: {
    type: 'CARD' | 'NEQUI' | 'PSE';
    token?: string;
    installments?: number;
    phone_number?: string;
  };
  payment_source_id?: string | number;
  redirect_url?: string;
}

export interface CreateWompiPaymentSourceDto {
  type: 'CARD' | 'NEQUI' | 'PSE';
  token: string;
  customer_email: string;
  acceptance_token?: string;
  accept_personal_auth?: string;
  customer_data?: {
    full_name: string;
    phone_number: string;
    legal_id: string;
    legal_id_type: string;
  };
}

export interface WompiMerchantResponse {
  data: {
    presigned_acceptance: {
      acceptance_token: string;
      permalink?: string;
      type?: string;
      accepted_at?: string | null;
    };
    presigned_personal_data_auth?: {
      acceptance_token: string;
      permalink?: string;
      type?: string;
    };
    acceptance_policies?: Record<string, unknown>;
  };
}

export interface WompiPaymentSourceResponse {
  data: {
    id: string;
    token?: string;
    type: string;
    status: string;
    customer_email?: string;
    public_data?: {
      bin?: string;
      last_four?: string;
      card_holder?: string;
      type?: string;
      phone_number?: string;
    };
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
      amount_in_cents?: number;
      payment_method_type?: string;
      payment_source_id?: string | number | null;
    };
  };
  environment?: string;
  signature: {
    properties: string[];
    checksum: string;
  };
  timestamp: number;
  sent_at?: string;
}

export interface WompiTransactionResponse {
  data: {
    id: string;
    status: string;
    reference: string;
    status_message?: string;
  };
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
  overage_charge_cents: number;
}

export interface CountRow {
  count: number;
}

export interface PlanRow {
  max_members: number;
  overage_member_cents: number;
}

export interface OveragePlanRow {
  overage_member_cents: number;
}

export interface CronSubscriptionRow {
  id: string;
  club_id: string;
  plan_id: string;
  status: string;
  current_period_start: Date | null;
  current_period_end: Date | null;
  pending_plan_id: string | null;
  wompi_customer_email: string;
  wompi_payment_source_id: string;
  wompi_payment_method_type: string | null;
  wompi_payment_phone: string | null;
  wompi_payment_source_status: string | null;
  price_cents: number;
  overage_member_cents: number;
}

export interface FailedTxRow {
  id: string;
  club_id: string;
  subscription_id: string;
  amount_cents: number;
  retry_count: number;
  wompi_customer_email: string;
  wompi_payment_source_id: string;
  wompi_payment_method_type: string | null;
  wompi_payment_phone: string | null;
  wompi_payment_source_status: string | null;
  sub_retry_count: number;
}

export interface PendingInvoiceRow {
  id: string;
  club_id: string;
  plan_amount_cents: number;
  overage_amount_cents: number;
  plan_name: string;
}
