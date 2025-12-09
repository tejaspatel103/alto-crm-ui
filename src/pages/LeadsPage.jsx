import FilterSidebar from "../components/FilterSidebar";
import LeadGrid from "../components/LeadGrid";
import Pagination from "../components/Pagination";

export default function LeadsPage() {
  return (
    <div className="layout">
      <FilterSidebar />
      <div className="content">
        <h1 className="page-title">AltoCRM – Leads</h1>
        <LeadGrid />
        <Pagination />
      </div>
    </div>
  );
}
