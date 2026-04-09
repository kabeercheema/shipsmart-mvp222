import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const authDisabled = process.env.AUTH_DISABLED === "true";

export async function GET(request: NextRequest) {
  try {
    if (authDisabled) {
      return NextResponse.json({
        totalOrders: 0,
        totalLabels: 0,
        pendingOrders: 0,
        labeledOrders: 0,
        shippedOrders: 0,
        subscriptionTier: "STARTER",
        recentOrders: [],
      });
    }

    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { prisma } = await import("@/lib/prisma");

    // Get stats
    const orders = await prisma.order.findMany({
      where: { userId: session.user.id }
    });

    const labels = await prisma.label.findMany({
      where: { order: { userId: session.user.id } }
    });

    const subscription = await prisma.subscription.findUnique({
      where: { userId: session.user.id }
    });

    const stats = {
      totalOrders: orders.length,
      totalLabels: labels.length,
      pendingOrders: orders.filter(o => o.status === "PENDING").length,
      labeledOrders: orders.filter(o => o.status === "LABELED").length,
      shippedOrders: orders.filter(o => o.status === "SHIPPED").length,
      subscriptionTier: subscription?.tier || "STARTER",
      recentOrders: orders
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Get stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
