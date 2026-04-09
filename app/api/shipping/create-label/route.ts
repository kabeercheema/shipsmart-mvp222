import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createFedExLabel, isFedExConfigured } from "@/lib/fedex";

interface CreateLabelRequest {
  orderId: string;
  carrier: string;
  service: string;
  rate: number;
}

// Generate a simple PDF label (in production, integrate with actual carrier APIs)
async function generatePDFLabel(order: any, carrier: string, trackingNumber: string) {
  // For now, return a simple PDF buffer
  // In production, use @react-pdf/renderer or pdfkit to generate actual shipping labels
  
  const pdfContent = `
Shipping Label
==============
Carrier: ${carrier}
Tracking: ${trackingNumber}

FROM:
${order.fromName}
${order.fromAddressLine1}
${order.fromCity}, ${order.fromState} ${order.fromZip}

TO:
${order.toName}
${order.toAddressLine1}
${order.toCity}, ${order.toState} ${order.toZip}

Weight: ${order.weight} ${order.weightUnit}
Created: ${new Date().toLocaleDateString()}
  `;

  return Buffer.from(pdfContent);
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json() as CreateLabelRequest;
    const { orderId, carrier, service, rate } = body;

    // Get order
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order || order.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    let trackingNumber: string;
    let labelPDF: Buffer;
    let selectedService = service;

    if (carrier.toLowerCase() === "fedex" && isFedExConfigured()) {
      const fedexResult = await createFedExLabel({
        serviceDisplayName: service,
        rate,
        order: {
          fromName: order.fromName,
          fromPhone: order.fromPhone,
          fromAddressLine1: order.fromAddressLine1,
          fromAddressLine2: order.fromAddressLine2,
          fromCity: order.fromCity,
          fromState: order.fromState,
          fromZip: order.fromZip,
          fromCountry: order.fromCountry,
          toName: order.toName,
          toPhone: order.toPhone,
          toAddressLine1: order.toAddressLine1,
          toAddressLine2: order.toAddressLine2,
          toCity: order.toCity,
          toState: order.toState,
          toZip: order.toZip,
          toCountry: order.toCountry,
          weight: order.weight,
          weightUnit: order.weightUnit,
          length: order.length,
          width: order.width,
          height: order.height,
          dimensionUnit: order.dimensionUnit,
        },
      });

      trackingNumber = fedexResult.trackingNumber;
      labelPDF = fedexResult.labelPdf;
      selectedService = service;
    } else {
      // Generate tracking number
      trackingNumber = `${carrier.substring(0, 2).toUpperCase()}${Date.now()}`;
      // Generate label PDF
      labelPDF = await generatePDFLabel(order, carrier, trackingNumber);
    }

    // Create label in database
    const label = await prisma.label.create({
      data: {
        orderId,
        carrier,
        trackingNumber,
        labelData: labelPDF
      }
    });

    // Update order with label and tracking info
    await prisma.order.update({
      where: { id: orderId },
      data: {
        selectedCarrier: carrier,
        selectedService,
        selectedRate: rate,
        labelId: label.id,
        trackingNumber,
        status: "LABELED"
      }
    });

    return NextResponse.json({
      label,
      trackingNumber,
      message: "Label created successfully"
    }, { status: 201 });
  } catch (error) {
    console.error("Create label error:", error);
    return NextResponse.json(
      { error: "Failed to create label" },
      { status: 500 }
    );
  }
}
