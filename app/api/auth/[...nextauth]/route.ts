import { GET as authGet, POST as authPost } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
	const pathname = new URL(request.url).pathname;
	if (process.env.AUTH_DISABLED === "true") {
		if (pathname.endsWith("/session")) {
			return NextResponse.json(null, { status: 200 });
		}

		return NextResponse.json({ error: "Auth disabled" }, { status: 503 });
	}

	try {
		return await authGet(request);
	} catch (error) {
		console.error("[Auth][route][GET] error", {
			path: pathname,
			message: error instanceof Error ? error.message : "Unknown error",
		});

		return NextResponse.json(
			{ error: "Authentication service misconfiguration" },
			{ status: 500 }
		);
	}
}

export async function POST(request: Request) {
	if (process.env.AUTH_DISABLED === "true") {
		return NextResponse.json({ error: "Auth disabled" }, { status: 503 });
	}

	try {
		return await authPost(request);
	} catch (error) {
		console.error("[Auth][route][POST] error", {
			path: new URL(request.url).pathname,
			message: error instanceof Error ? error.message : "Unknown error",
		});

		return NextResponse.json(
			{ error: "Authentication service misconfiguration" },
			{ status: 500 }
		);
	}
}
