import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Construction, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function StubPage({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="p-6 lg:p-10">
      <Card className="p-10 text-center max-w-2xl mx-auto">
        <div className="mx-auto h-14 w-14 grid place-items-center rounded-full bg-[color:var(--info)]/10 text-[color:var(--info)] mb-4">
          <Construction className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">{desc}</p>
        <Button asChild className="mt-6" variant="outline">
          <Link to="/">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Billing
          </Link>
        </Button>
      </Card>
    </div>
  );
}
