import type { Metadata } from "next";
import { getDb } from "@/lib/database";
import { listCityCoverage } from "@/features/locations/service";
import { ContentPage } from "@/components/domain/content-page";
import { CoverageChecker } from "@/components/domain/coverage-checker";
import { Badge, Card } from "@/components/ui/surface";
import { site } from "@/lib/config/site";

export const metadata: Metadata = { title: "Where we serve" };

export default async function CoveragePage({ searchParams }: { searchParams: Promise<{ pincode?: string }> }) {
  const { pincode } = await searchParams;
  const cities = await listCityCoverage(await getDb());
  return (
    <ContentPage eyebrow="Coverage" title="Where we serve" intro={site.launch.pilotDescription}>
      <Card className="p-6">
        <p className="mb-3 font-semibold text-ink">Check your pincode</p>
        <CoverageChecker initialPincode={pincode && /^\d{6}$/.test(pincode) ? pincode : ""} />
      </Card>
      <ul className="space-y-3">
        {cities.map((c) => (
          <li key={c.id}>
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <p className="font-bold text-ink">
                  {c.name}, {c.state}
                </p>
                <Badge tone={c.status === "LIVE" ? "success" : c.status === "PILOT" ? "info" : "neutral"}>{c.status === "COMING_SOON" ? "Not open yet" : c.status.toLowerCase()}</Badge>
              </div>
              <p className="mt-1 text-sm">
                {c.liveAreas.length && ["LIVE", "PILOT"].includes(c.status) ? `Taking bookings in: ${c.liveAreas.join(", ")}.` : "Not taking bookings yet."}
                {c.plannedAreas.length > 0 && ` Planned: ${c.plannedAreas.join(", ")}.`}
              </p>
            </Card>
          </li>
        ))}
      </ul>
    </ContentPage>
  );
}
