// Right rail — decision cards in mockup order. Planner sees the full toolset;
// Citizen sees the read-only microclimate + vulnerability view.
import { useClimaStore } from "../../store/useClimaStore";
import MicroclimateCard from "./MicroclimateCard";
import VulnerabilityCard from "./VulnerabilityCard";
import SimulateCard from "./SimulateCard";
import ProposalCard from "./ProposalCard";

export default function Sidebar() {
  const view = useClimaStore((s) => s.view);
  const planner = view === "planner";
  return (
    <aside className="sidebar ct-scroll">
      <MicroclimateCard />
      <VulnerabilityCard />
      {planner && <SimulateCard />}
      <ProposalCard />
    </aside>
  );
}
