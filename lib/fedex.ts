const FEDEX_SERVICE_NAME_TO_TYPE: Record<string, string> = {
  "FedEx Ground": "FEDEX_GROUND",
  "FedEx Home Delivery": "GROUND_HOME_DELIVERY",
  "FedEx 2Day": "FEDEX_2_DAY",
  "FedEx Express Saver": "FEDEX_EXPRESS_SAVER",
  "FedEx Priority Overnight": "PRIORITY_OVERNIGHT",
  "FedEx Standard Overnight": "STANDARD_OVERNIGHT",
};

const FEDEX_TRANSIT_TO_DAYS: Record<string, number> = {
  ONE_DAY: 1,
  TWO_DAYS: 2,
  THREE_DAYS: 3,
  FOUR_DAYS: 4,
  FIVE_DAYS: 5,
  SIX_DAYS: 6,
  SEVEN_DAYS: 7,
  EIGHT_DAYS: 8,
  NINE_DAYS: 9,
  TEN_DAYS: 10,
};

interface FedExConfig {
  apiKey: string;
  apiSecret: string;
  accountNumber: string;
  baseUrl: string;
}

interface FedExRateRequest {
  fromZip: string;
  toZip: string;
  weight: number;
  length?: number;
  width?: number;
  height?: number;
}

interface FedExShippingRate {
  carrier: string;
  service: string;
  rate: number;
  estimatedDays: number;
  currency: string;
  serviceType: string;
}

interface FedExLabelRequest {
  serviceDisplayName: string;
  rate: number;
  order: {
    fromName: string;
    fromPhone?: string | null;
    fromAddressLine1: string;
    fromAddressLine2?: string | null;
    fromCity: string;
    fromState: string;
    fromZip: string;
    fromCountry?: string | null;
    toName: string;
    toPhone?: string | null;
    toAddressLine1: string;
    toAddressLine2?: string | null;
    toCity: string;
    toState: string;
    toZip: string;
    toCountry?: string | null;
    weight: number;
    weightUnit?: string | null;
    length?: number | null;
    width?: number | null;
    height?: number | null;
    dimensionUnit?: string | null;
  };
}

interface FedExLabelResult {
  trackingNumber: string;
  labelPdf: Buffer;
  serviceType: string;
}

function getFedExConfig(): FedExConfig | null {
  const apiKey = process.env.FEDEX_API_KEY;
  const apiSecret = process.env.FEDEX_API_SECRET;
  const accountNumber = process.env.FEDEX_ACCOUNT_NUMBER;
  const baseUrl = process.env.FEDEX_BASE_URL ?? "https://apis-sandbox.fedex.com";

  if (!apiKey || !apiSecret || !accountNumber) {
    return null;
  }

  return {
    apiKey,
    apiSecret,
    accountNumber,
    baseUrl,
  };
}

export function isFedExConfigured(): boolean {
  return getFedExConfig() !== null;
}

function normalizeUnit(unit?: string | null): "LB" | "KG" {
  if (!unit) return "LB";
  return unit.toUpperCase() === "KG" ? "KG" : "LB";
}

function normalizeDimensionUnit(unit?: string | null): "IN" | "CM" {
  if (!unit) return "IN";
  return unit.toUpperCase() === "CM" ? "CM" : "IN";
}

function formatServiceType(serviceType: string): string {
  const lower = serviceType.toLowerCase();
  if (lower.includes("ground_home_delivery")) return "FedEx Home Delivery";
  if (lower.includes("fedex_ground")) return "FedEx Ground";
  if (lower.includes("fedex_2_day")) return "FedEx 2Day";
  if (lower.includes("fedex_express_saver")) return "FedEx Express Saver";
  if (lower.includes("priority_overnight")) return "FedEx Priority Overnight";
  if (lower.includes("standard_overnight")) return "FedEx Standard Overnight";

  const plain = serviceType.replace(/_/g, " ").toLowerCase();
  return `FedEx ${plain.replace(/\b\w/g, (c) => c.toUpperCase())}`;
}

function serviceNameToType(serviceDisplayName: string): string {
  return FEDEX_SERVICE_NAME_TO_TYPE[serviceDisplayName] ?? "FEDEX_GROUND";
}

function estimateDaysFromTransit(transitTime?: string): number {
  if (!transitTime) return 5;
  return FEDEX_TRANSIT_TO_DAYS[transitTime] ?? 5;
}

async function getFedExAccessToken(config: FedExConfig): Promise<string> {
  const response = await fetch(`${config.baseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.apiKey,
      client_secret: config.apiSecret,
    }),
  });

  const tokenData = await response.json();

  if (!response.ok || !tokenData?.access_token) {
    throw new Error(`FedEx auth failed (${response.status})`);
  }

  return tokenData.access_token as string;
}

function extractRateAmount(rateReplyDetail: any): number | null {
  const ratedDetails: any[] = rateReplyDetail?.ratedShipmentDetails ?? [];

  for (const detail of ratedDetails) {
    const amount = detail?.totalNetCharge?.amount ?? detail?.shipmentRateDetail?.totalNetCharge?.amount;
    if (typeof amount === "number" && Number.isFinite(amount)) {
      return amount;
    }
  }

  return null;
}

export async function getFedExRates(input: FedExRateRequest): Promise<FedExShippingRate[]> {
  const config = getFedExConfig();
  if (!config) {
    throw new Error("FedEx not configured");
  }

  const token = await getFedExAccessToken(config);

  const payload = {
    accountNumber: { value: config.accountNumber },
    requestedShipment: {
      shipper: {
        address: {
          postalCode: input.fromZip,
          countryCode: "US",
        },
      },
      recipient: {
        address: {
          postalCode: input.toZip,
          countryCode: "US",
          residential: false,
        },
      },
      pickupType: "DROPOFF_AT_FEDEX_LOCATION",
      rateRequestType: ["ACCOUNT", "LIST"],
      requestedPackageLineItems: [
        {
          weight: {
            units: "LB",
            value: Number(input.weight.toFixed(2)),
          },
          dimensions: {
            length: Math.max(1, Math.round(input.length ?? 12)),
            width: Math.max(1, Math.round(input.width ?? 8)),
            height: Math.max(1, Math.round(input.height ?? 6)),
            units: "IN",
          },
        },
      ],
    },
  };

  const response = await fetch(`${config.baseUrl}/rate/v1/rates/quotes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`FedEx rates failed (${response.status})`);
  }

  const details: any[] = data?.output?.rateReplyDetails ?? [];
  const rates = details
    .map((detail) => {
      const serviceType = detail?.serviceType as string | undefined;
      if (!serviceType) return null;

      const amount = extractRateAmount(detail);
      if (amount === null) return null;

      const transitTime = detail?.transitTime as string | undefined;
      return {
        carrier: "FedEx",
        service: formatServiceType(serviceType),
        serviceType,
        rate: Number(amount.toFixed(2)),
        estimatedDays: estimateDaysFromTransit(transitTime),
        currency: "USD",
      } as FedExShippingRate;
    })
    .filter((rate): rate is FedExShippingRate => Boolean(rate));

  return rates.sort((a, b) => a.rate - b.rate);
}

export async function createFedExLabel(input: FedExLabelRequest): Promise<FedExLabelResult> {
  const config = getFedExConfig();
  if (!config) {
    throw new Error("FedEx not configured");
  }

  const token = await getFedExAccessToken(config);
  const serviceType = serviceNameToType(input.serviceDisplayName);

  const payload = {
    labelResponseOptions: "LABEL",
    accountNumber: { value: config.accountNumber },
    requestedShipment: {
      shipDatestamp: new Date().toISOString().slice(0, 10),
      pickupType: "DROPOFF_AT_FEDEX_LOCATION",
      serviceType,
      packagingType: "YOUR_PACKAGING",
      totalWeight: {
        units: normalizeUnit(input.order.weightUnit),
        value: Number(input.order.weight.toFixed(2)),
      },
      totalPackageCount: 1,
      shipper: {
        contact: {
          personName: input.order.fromName,
          phoneNumber: input.order.fromPhone || "0000000000",
        },
        address: {
          streetLines: [input.order.fromAddressLine1, input.order.fromAddressLine2].filter(Boolean),
          city: input.order.fromCity,
          stateOrProvinceCode: input.order.fromState,
          postalCode: input.order.fromZip,
          countryCode: input.order.fromCountry || "US",
        },
      },
      recipients: [
        {
          contact: {
            personName: input.order.toName,
            phoneNumber: input.order.toPhone || "0000000000",
          },
          address: {
            streetLines: [input.order.toAddressLine1, input.order.toAddressLine2].filter(Boolean),
            city: input.order.toCity,
            stateOrProvinceCode: input.order.toState,
            postalCode: input.order.toZip,
            countryCode: input.order.toCountry || "US",
            residential: false,
          },
        },
      ],
      shippingChargesPayment: {
        paymentType: "SENDER",
      },
      labelSpecification: {
        imageType: "PDF",
        labelStockType: "PAPER_4X6",
      },
      requestedPackageLineItems: [
        {
          weight: {
            units: normalizeUnit(input.order.weightUnit),
            value: Number(input.order.weight.toFixed(2)),
          },
          dimensions: {
            length: Math.max(1, Math.round(input.order.length ?? 12)),
            width: Math.max(1, Math.round(input.order.width ?? 8)),
            height: Math.max(1, Math.round(input.order.height ?? 6)),
            units: normalizeDimensionUnit(input.order.dimensionUnit),
          },
        },
      ],
      requestedPackageLineItemCount: 1,
    },
  };

  const response = await fetch(`${config.baseUrl}/ship/v1/shipments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    const fedexMessage = data?.errors?.[0]?.message;
    throw new Error(fedexMessage ? `FedEx shipment failed: ${fedexMessage}` : `FedEx shipment failed (${response.status})`);
  }

  const shipment = data?.output?.transactionShipments?.[0];
  const trackingNumber = shipment?.pieceResponses?.[0]?.trackingNumber as string | undefined;
  const labelBase64 = shipment?.pieceResponses?.[0]?.packageDocuments?.[0]?.encodedLabel as string | undefined;

  if (!trackingNumber || !labelBase64) {
    throw new Error("FedEx shipment response missing tracking or label data");
  }

  return {
    trackingNumber,
    labelPdf: Buffer.from(labelBase64, "base64"),
    serviceType,
  };
}
