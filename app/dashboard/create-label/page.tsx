"use client";

import { useState, useCallback, useEffect } from "react";
import { ShippingForm } from "@/components/dashboard/shipping-form";
import { RateComparison } from "@/components/dashboard/rate-comparison";
import { LabelPreview } from "@/components/dashboard/label-preview";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import {
  type ShipmentDetails,
} from "@/lib/carriers";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ShippingRate {
  carrier: string;
  service: string;
  rate: number;
  estimatedDays: number;
  currency: string;
}

export default function CreateLabelPage() {
  const { toast } = useToast();
  const [step, setStep] = useState<"details" | "rates" | "review">("details");
  const [shipmentDetails, setShipmentDetails] = useState<ShipmentDetails>({
    weight: 0,
    length: 0,
    width: 0,
    height: 0,
    fromZip: "",
    toZip: "",
  });
  const [fromAddress, setFromAddress] = useState({
    name: "Your Business",
    address: "123 Warehouse St",
    city: "Los Angeles",
    state: "CA",
    zip: "",
  });
  const [toAddress, setToAddress] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    zip: "",
  });
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [selectedRate, setSelectedRate] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleCalculateRates = useCallback(async () => {
    if (!shipmentDetails.fromZip || !shipmentDetails.toZip || !shipmentDetails.weight) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setIsCalculating(true);
    try {
      const response = await fetch("/api/shipping/calculate-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weight: shipmentDetails.weight,
          length: shipmentDetails.length || 12,
          width: shipmentDetails.width || 8,
          height: shipmentDetails.height || 6,
          fromZip: shipmentDetails.fromZip,
          toZip: shipmentDetails.toZip,
          isInternational: false
        })
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null) as
          | { error?: string; reason?: string; provider?: string; code?: string }
          | null;

        const errorMessage =
          errorPayload?.reason || errorPayload?.error || "Failed to calculate rates";

        throw new Error(errorMessage);
      }

      const data = await response.json();
      const formattedRates = data.rates.map((r: ShippingRate) => ({
        ...r,
        id: `${r.carrier}-${r.service}`
      }));
      
      setRates(formattedRates);
      setSelectedRate(formattedRates[0]?.id || null);
      setStep("rates");
      
      toast({
        title: "Success",
        description: `Found ${formattedRates.length} shipping options`
      });
    } catch (error) {
      console.error("Error calculating rates:", error);
      toast({
        title: "Error",
        description: "Failed to calculate rates. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsCalculating(false);
    }
  }, [shipmentDetails, toast]);

  const handleCreateLabel = useCallback(async () => {
    if (!selectedRate) return;

    setIsCreating(true);
    try {
      // First create the order
      const orderResponse = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromName: fromAddress.name,
          fromAddressLine1: fromAddress.address,
          fromCity: fromAddress.city,
          fromState: fromAddress.state,
          fromZip: fromAddress.zip,
          fromCountry: "US",
          toName: toAddress.name,
          toAddressLine1: toAddress.address,
          toCity: toAddress.city,
          toState: toAddress.state,
          toZip: toAddress.zip,
          toCountry: "US",
          weight: shipmentDetails.weight,
          weightUnit: "lbs",
          length: shipmentDetails.length,
          width: shipmentDetails.width,
          height: shipmentDetails.height,
          dimensionUnit: "in",
          status: "PENDING"
        })
      });

      if (!orderResponse.ok) throw new Error("Failed to create order");
      const order = await orderResponse.json();

      // Then create the label
      const [carrier, ...serviceParts] = selectedRate.split("-");
      const service = serviceParts.join("-");
      const selectedRateData = rates.find(r => `${r.carrier}-${r.service}` === selectedRate);

      const labelResponse = await fetch("/api/shipping/create-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          carrier,
          service,
          rate: selectedRateData?.rate || 0
        })
      });

      if (!labelResponse.ok) throw new Error("Failed to create label");
      
      setIsCreating(false);
      setShowSuccess(true);
      
      toast({
        title: "Success",
        description: "Shipping label created successfully!"
      });
    } catch (error) {
      console.error("Error creating label:", error);
      toast({
        title: "Error",
        description: "Failed to create label. Please try again.",
        variant: "destructive"
      });
      setIsCreating(false);
    }
  }, [selectedRate, rates, fromAddress, toAddress, shipmentDetails, toast]);

  const selectedRateData = rates.find((r) => `${r.carrier}-${r.service}` === selectedRate) || null;

  const updateFromAddress = (field: string, value: string) => {
    setFromAddress((prev) => ({ ...prev, [field]: value }));
    if (field === "zip") {
      setShipmentDetails((prev) => ({ ...prev, fromZip: value }));
    }
  };

  const updateToAddress = (field: string, value: string) => {
    setToAddress((prev) => ({ ...prev, [field]: value }));
    if (field === "zip") {
      setShipmentDetails((prev) => ({ ...prev, toZip: value }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Shipping Label</h1>
          <p className="text-muted-foreground">
            Compare rates and create labels for your shipments
          </p>
        </div>
      </div>

      <Tabs value={step} className="space-y-6">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="details" onClick={() => setStep("details")}>
            1. Details
          </TabsTrigger>
          <TabsTrigger
            value="rates"
            onClick={() => rates.length > 0 && setStep("rates")}
            disabled={rates.length === 0}
          >
            2. Select Rate
          </TabsTrigger>
          <TabsTrigger
            value="review"
            onClick={() => selectedRate && setStep("review")}
            disabled={!selectedRate}
          >
            3. Review
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* From Address */}
            <Card>
              <CardHeader>
                <CardTitle>Ship From</CardTitle>
                <CardDescription>Your warehouse or return address</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="fromName">Name / Company</FieldLabel>
                    <Input
                      id="fromName"
                      value={fromAddress.name}
                      onChange={(e) => updateFromAddress("name", e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="fromAddress">Street Address</FieldLabel>
                    <Input
                      id="fromAddress"
                      value={fromAddress.address}
                      onChange={(e) => updateFromAddress("address", e.target.value)}
                    />
                  </Field>
                  <div className="grid grid-cols-3 gap-4">
                    <Field>
                      <FieldLabel htmlFor="fromCity">City</FieldLabel>
                      <Input
                        id="fromCity"
                        value={fromAddress.city}
                        onChange={(e) => updateFromAddress("city", e.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="fromState">State</FieldLabel>
                      <Input
                        id="fromState"
                        value={fromAddress.state}
                        onChange={(e) => updateFromAddress("state", e.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="fromZip">ZIP Code</FieldLabel>
                      <Input
                        id="fromZip"
                        value={fromAddress.zip}
                        onChange={(e) => updateFromAddress("zip", e.target.value)}
                      />
                    </Field>
                  </div>
                </FieldGroup>
              </CardContent>
            </Card>

            {/* To Address */}
            <Card>
              <CardHeader>
                <CardTitle>Ship To</CardTitle>
                <CardDescription>Customer delivery address</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="toName">Name</FieldLabel>
                    <Input
                      id="toName"
                      placeholder="Customer name"
                      value={toAddress.name}
                      onChange={(e) => updateToAddress("name", e.target.value)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="toAddressLine">Street Address</FieldLabel>
                    <Input
                      id="toAddressLine"
                      placeholder="123 Main St"
                      value={toAddress.address}
                      onChange={(e) => updateToAddress("address", e.target.value)}
                    />
                  </Field>
                  <div className="grid grid-cols-3 gap-4">
                    <Field>
                      <FieldLabel htmlFor="toCity">City</FieldLabel>
                      <Input
                        id="toCity"
                        placeholder="City"
                        value={toAddress.city}
                        onChange={(e) => updateToAddress("city", e.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="toState">State</FieldLabel>
                      <Input
                        id="toState"
                        placeholder="ST"
                        value={toAddress.state}
                        onChange={(e) => updateToAddress("state", e.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="toZip">ZIP Code</FieldLabel>
                      <Input
                        id="toZip"
                        placeholder="12345"
                        value={toAddress.zip}
                        onChange={(e) => updateToAddress("zip", e.target.value)}
                      />
                    </Field>
                  </div>
                </FieldGroup>
              </CardContent>
            </Card>
          </div>

          {/* Package Details */}
          <Card>
            <CardHeader>
              <CardTitle>Package Details</CardTitle>
              <CardDescription>Enter the weight and dimensions of your package</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-4">
                <Field>
                  <FieldLabel htmlFor="packageWeight">Weight (lbs)</FieldLabel>
                  <Input
                    id="packageWeight"
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    value={shipmentDetails.weight || ""}
                    onChange={(e) =>
                      setShipmentDetails((prev) => ({
                        ...prev,
                        weight: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="packageLength">Length (in)</FieldLabel>
                  <Input
                    id="packageLength"
                    type="number"
                    placeholder="0"
                    value={shipmentDetails.length || ""}
                    onChange={(e) =>
                      setShipmentDetails((prev) => ({
                        ...prev,
                        length: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="packageWidth">Width (in)</FieldLabel>
                  <Input
                    id="packageWidth"
                    type="number"
                    placeholder="0"
                    value={shipmentDetails.width || ""}
                    onChange={(e) =>
                      setShipmentDetails((prev) => ({
                        ...prev,
                        width: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="packageHeight">Height (in)</FieldLabel>
                  <Input
                    id="packageHeight"
                    type="number"
                    placeholder="0"
                    value={shipmentDetails.height || ""}
                    onChange={(e) =>
                      setShipmentDetails((prev) => ({
                        ...prev,
                        height: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={handleCalculateRates}
              disabled={
                isCalculating ||
                !fromAddress.zip ||
                !toAddress.zip ||
                !shipmentDetails.weight
              }
            >
              {isCalculating ? "Calculating..." : "Compare Rates"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="rates" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Available Rates</CardTitle>
                  <CardDescription>
                    {rates.length} shipping options sorted by price
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RateComparison
                    rates={rates}
                    selectedRate={selectedRate}
                    onSelectRate={setSelectedRate}
                  />
                </CardContent>
              </Card>
            </div>

            <div>
              <LabelPreview
                selectedRate={selectedRateData}
                fromAddress={{ ...fromAddress, zip: shipmentDetails.fromZip }}
                toAddress={{ ...toAddress, zip: shipmentDetails.toZip }}
                onCreateLabel={() => setStep("review")}
                isCreating={false}
              />
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("details")}>
              Back to Details
            </Button>
            <Button size="lg" onClick={() => setStep("review")} disabled={!selectedRate}>
              Continue to Review
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="review" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Shipment Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">From</p>
                      <p className="font-medium">{fromAddress.name}</p>
                      <p className="text-sm">
                        {fromAddress.city}, {fromAddress.state} {fromAddress.zip}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">To</p>
                      <p className="font-medium">{toAddress.name}</p>
                      <p className="text-sm">
                        {toAddress.city}, {toAddress.state} {toAddress.zip}
                      </p>
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Package Weight</span>
                      <span className="font-medium">{shipmentDetails.weight} lbs</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Dimensions</span>
                      <span className="font-medium">
                        {shipmentDetails.length} x {shipmentDetails.width} x{" "}
                        {shipmentDetails.height} in
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Selected Service</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedRateData && (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{selectedRateData.service}</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedRateData.estimatedDays} business day{selectedRateData.estimatedDays !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <p className="text-2xl font-bold">
                        ${(selectedRateData.rate ?? 0).toFixed(2)}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <LabelPreview
              selectedRate={selectedRateData}
              fromAddress={{ ...fromAddress, zip: shipmentDetails.fromZip }}
              toAddress={{ ...toAddress, zip: shipmentDetails.toZip }}
              onCreateLabel={handleCreateLabel}
              isCreating={isCreating}
            />
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("rates")}>
              Back to Rates
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Success Dialog */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 mb-4">
              <CheckCircle2 className="h-6 w-6 text-success" />
            </div>
            <DialogTitle className="text-center">Label Created Successfully!</DialogTitle>
            <DialogDescription className="text-center">
              Your shipping label has been created and is ready for printing.
              The tracking number is <strong>1Z999AA10123456784</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-4">
            <Button>Download Label (PDF)</Button>
            <Button variant="outline">Print Label</Button>
            <Link href="/dashboard" className="w-full">
              <Button variant="ghost" className="w-full">
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
