"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Zap } from "lucide-react";
import { carriers } from "@/lib/carriers";
import { cn } from "@/lib/utils";

interface Rate {
  carrier: string;
  service: string;
  rate: number;
  estimatedDays: number;
  currency: string;
  id?: string;
  name?: string;
  price?: number;
  deliveryDays?: string;
  carrierId?: string;
}

interface RateComparisonProps {
  rates: Rate[];
  selectedRate: string | null;
  onSelectRate: (rateId: string) => void;
}

export function RateComparison({
  rates,
  selectedRate,
  onSelectRate,
}: RateComparisonProps) {
  const cheapestRate = `${rates[0]?.carrier}-${rates[0]?.service}`;
  const fastestRate = rates.find((r) =>
    r.estimatedDays <= 2
  );

  const getCarrierInfo = (carrierName: string) => {
    const normalizedName = carrierName.toLowerCase();
    return carriers.find((c) => c.id === normalizedName);
  };

  return (
    <div className="space-y-3">
      {rates.map((rate, index) => {
        const rateId = rate.id || `${rate.carrier}-${rate.service}`;
        const carrierInfo = getCarrierInfo(rate.carrier);
        const isSelected = selectedRate === rateId;
        const isCheapest = index === 0;
        const isFastest = fastestRate && rateId === `${fastestRate.carrier}-${fastestRate.service}`;
        const currentRate = Number.isFinite(rate.rate) ? rate.rate : 0;
        const cheapestBaseRate = Number.isFinite(rates[0]?.rate) ? (rates[0]?.rate as number) : 0;

        return (
          <Card
            key={rateId}
            className={cn(
              "cursor-pointer transition-all hover:border-primary/50",
              isSelected && "border-primary bg-primary/5"
            )}
            onClick={() => onSelectRate(rateId)}
          >
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-lg text-xs font-bold"
                  style={{
                    backgroundColor: carrierInfo?.color || "#666",
                    color:
                      carrierInfo?.id === "dhl" ? "#000" : "#fff",
                  }}
                >
                  {carrierInfo?.logo || rate.carrier.substring(0, 2)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{rate.service}</h3>
                    {isCheapest && (
                      <Badge className="bg-success text-success-foreground">
                        Best Price
                      </Badge>
                    )}
                    {isFastest && (
                      <Badge variant="outline" className="border-primary text-primary">
                        <Zap className="mr-1 h-3 w-3" />
                        Fastest
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {rate.estimatedDays} business day{rate.estimatedDays !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-2xl font-bold">${currentRate.toFixed(2)}</p>
                  {!isCheapest && (
                    <p className="text-xs text-muted-foreground">
                      ${(currentRate - cheapestBaseRate).toFixed(2)} more
                    </p>
                  )}
                </div>
                <Button
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className="w-24"
                >
                  {isSelected ? (
                    <>
                      <Check className="mr-1 h-4 w-4" />
                      Selected
                    </>
                  ) : (
                    "Select"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
