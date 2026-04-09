import { NextRequest, NextResponse } from "next/server";
import { getFedExRates, isFedExConfigured } from "@/lib/fedex";

interface RateRequest {
  weight: number;
  length?: number;
  width?: number;
  height?: number;
  fromZip: string;
  toZip: string;
  isInternational: boolean;
}

interface ShippingRate {
  carrier: string;
  service: string;
  rate: number;
  estimatedDays: number;
  currency: string;
}

// Mock rates for all carriers
function getMockRates(params: RateRequest): ShippingRate[] {
  const { weight, length = 12, width = 8, height = 6 } = params;

  const baseRates: Record<string, number> = {
    "USPS Ground Advantage": 3.99 + weight * 0.15,
    "USPS Priority Mail": 7.99 + weight * 0.35,
    "USPS Priority Express": 24.99 + weight * 0.15,
    "UPS Ground": 8.99 + weight * 0.45,
    "UPS 3-Day Select": 15.99 + weight * 0.5,
    "UPS 2nd Day Air": 22.99 + weight * 0.65,
    "FedEx Ground": 9.49 + weight * 0.5,
    "FedEx Express Saver": 18.99 + weight * 0.7,
    "FedEx 2Day": 24.99 + weight * 0.85,
    "DHL Express": 28.99 + weight * 0.75,
    "DHL Parcel Ground": 10.99 + weight * 0.4,
  };

  const volume = (length * width * height) / 166;
  const billableWeight = Math.max(weight, volume);

  const rates = Object.entries(baseRates).map(([service, baseRate]) => ({
    carrier: service.split(" ")[0],
    service,
    rate: Number((baseRate * (billableWeight / weight)).toFixed(2)),
    estimatedDays: getEstimatedDays(service),
    currency: "USD",
  }));

  return rates;
}

function getEstimatedDays(service: string): number {
  const estimates: Record<string, number> = {
    "Ground Advantage": 5,
    "Priority Mail": 3,
    "Priority Express": 1,
    "Ground": 5,
    "3-Day Select": 3,
    "2nd Day Air": 2,
    "Express Saver": 5,
    "2Day": 2,
    "Express": 1,
    "Parcel Ground": 5,
  };

  for (const [key, days] of Object.entries(estimates)) {
    if (service.includes(key)) return days;
  }
  return 5;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RateRequest;
    const fedexRequireLive = process.env.FEDEX_REQUIRE_LIVE !== "false";

    if (!body.weight || body.weight <= 0) {
      return NextResponse.json(
        { error: "Weight must be greater than 0" },
        { status: 400 }
      );
    }

    console.log("[Rates API] Request - From:", body.fromZip, "To:", body.toZip, "Weight:", body.weight);

    // Start with baseline mock rates for non-FedEx carriers only.
    const mockRates = getMockRates(body);
    const nonFedExMock = mockRates.filter((r) => r.carrier.toLowerCase() !== "fedex");
    let rates = nonFedExMock;
    let fedexLive = false;
    let fedexErrorMessage: string | null = null;

    if (!isFedExConfigured()) {
      const errorPayload = {
        error: "FedEx live rates are unavailable because FedEx credentials are not configured",
        provider: "fedex",
        code: "FEDEX_NOT_CONFIGURED",
        fedexLive,
      };

      if (fedexRequireLive) {
        return NextResponse.json(errorPayload, { status: 503 });
      }
    }

    if (isFedExConfigured()) {
      try {
        const fedexLiveRates = await getFedExRates({
          fromZip: body.fromZip,
          toZip: body.toZip,
          weight: body.weight,
          length: body.length,
          width: body.width,
          height: body.height,
        });

        if (fedexLiveRates.length > 0) {
          rates = [...nonFedExMock, ...fedexLiveRates];
          fedexLive = true;
        } else {
          fedexErrorMessage = "FedEx returned no rates for this shipment";
          if (fedexRequireLive) {
            return NextResponse.json(
              {
                error: fedexErrorMessage,
                provider: "fedex",
                code: "FEDEX_NO_RATES",
                fedexLive,
              },
              { status: 502 }
            );
          }
        }
      } catch (fedexError) {
        fedexErrorMessage = fedexError instanceof Error ? fedexError.message : "Unknown FedEx error";
        console.error("[Rates API] FedEx live rates failed:", {
          message: fedexErrorMessage,
        });

        if (fedexRequireLive) {
          return NextResponse.json(
            {
              error: "FedEx live rates request failed",
              provider: "fedex",
              code: "FEDEX_LIVE_REQUEST_FAILED",
              reason: fedexErrorMessage,
              fedexLive,
            },
            { status: 502 }
          );
        }
      }
    }

    // Sort by price (ascending)
    rates.sort((a, b) => a.rate - b.rate);

    console.log("[Rates API] Returning", rates.length, "rates");

    return NextResponse.json({
      rates: rates,
      bestRate: rates[0],
      fedexLive,
      fedexSource: fedexLive ? "live" : "none",
      fedexRateCount: rates.filter((r) => r.carrier.toLowerCase() === "fedex").length,
      fedexErrorMessage,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Rates API] Error:", error);
    return NextResponse.json(
      { error: "Failed to calculate rates" },
      { status: 500 }
    );
  }
}
