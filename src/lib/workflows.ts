export interface Workflow {
  id: string;
  label: string;
  icon: string;
  desc: string;
  color: string;
}

export const WORKFLOWS: Record<string, Workflow> = {
  icp_builder: {
    id: "icp_builder",
    label: "ICP Builder",
    icon: "🎯",
    desc: "Define your Ideal Customer Profile with AI",
    color: "#6366f1",
  },
  account_discovery: {
    id: "account_discovery",
    label: "Account Discovery",
    icon: "🔍",
    desc: "Find high-fit accounts matching your ICP",
    color: "#06b6d4",
  },
  contact_finder: {
    id: "contact_finder",
    label: "Contact Finder",
    icon: "👤",
    desc: "Discover decision-makers at target accounts",
    color: "#8b5cf6",
  },
  enrichment: {
    id: "enrichment",
    label: "Data Enrichment",
    icon: "📊",
    desc: "Enrich accounts & contacts with live signals",
    color: "#f59e0b",
  },
  outreach: {
    id: "outreach",
    label: "AI Outreach",
    icon: "✉️",
    desc: "Generate personalized outreach sequences",
    color: "#10b981",
  },
  crm_sync: {
    id: "crm_sync",
    label: "CRM Sync",
    icon: "🔄",
    desc: "Plan CRM data sync strategies",
    color: "#ec4899",
  },
};

export const SYSTEM_PROMPTS: Record<string, string> = {
  icp_builder: `You are WiseAI's ICP Builder Agent. Use the web_search tool to research real market data, then build a structured ICP with: firmographic criteria (industry, company size, revenue, geography), technographic signals, behavioral/intent signals, scoring framework, and 5-10 sample target companies. Always search the web first. Be specific and data-driven.`,
  account_discovery: `You are WiseAI's Account Discovery Agent. Use web_search multiple times with varied queries to find REAL companies matching the user's criteria. For each company provide: company name, domain, industry, headcount, funding stage, and ICP fit score (1-100). Present results ranked by fit score. Use real verifiable companies only.`,
  contact_finder: `You are WiseAI's Contact Finder Agent. Use web_search to find leadership teams and decision-makers at target companies. Search "[company] leadership", "[company] VP engineering", etc. For each contact provide: name, title, department, and relevance score. Focus on VP+, Directors, and C-suite.`,
  enrichment: `You are WiseAI's Data Enrichment Agent. Use web_search extensively — search funding rounds, tech stack, recent news, competitors, and hiring signals for the given company. Compile a comprehensive intelligence brief. Search at least 3 times for different data points.`,
  outreach: `You are WiseAI's AI Outreach Agent. Use web_search to research the prospect and their company, then generate a 3-email sequence (initial outreach, follow-up, break-up) with real personalization hooks based on your research. Make it human, specific, and compelling.`,
  crm_sync: `You are WiseAI's CRM Sync Agent. Help plan CRM sync strategies — field mappings, pipeline structures, data quality checks, and automation workflows. Use web_search for best practices and integration patterns if helpful.`,
};

export const PROGRESS_STEPS: Record<string, string[]> = {
  icp_builder: [
    "Analyzing input",
    "Researching market data",
    "Mapping criteria",
    "Building scoring framework",
    "Generating report",
  ],
  account_discovery: [
    "Parsing criteria",
    "Searching companies",
    "Filtering matches",
    "Scoring accounts",
    "Compiling results",
  ],
  contact_finder: [
    "Resolving company",
    "Finding contacts",
    "Filtering roles",
    "Ranking relevance",
    "Preparing list",
  ],
  enrichment: [
    "Identifying targets",
    "Pulling intelligence",
    "Scanning signals",
    "Analyzing landscape",
    "Building report",
  ],
  outreach: [
    "Analyzing prospect",
    "Researching context",
    "Crafting hooks",
    "Writing sequence",
    "Finalizing",
  ],
  crm_sync: [
    "Preparing data",
    "Mapping fields",
    "Planning sync",
    "Validating schema",
    "Confirming strategy",
  ],
};

export const QUICK_PROMPTS: Record<string, string[]> = {
  icp_builder: [
    "Build an ICP for a B2B SaaS selling to mid-market companies",
    "Define ICP for AI developer tools targeting enterprise",
  ],
  account_discovery: [
    "Find SaaS companies with 50-500 employees that raised Series B",
    "Search for AI/ML startups with $10M+ funding",
  ],
  contact_finder: [
    "Find VP of Engineering at Stripe",
    "Get decision-makers at Notion in product and engineering",
  ],
  enrichment: [
    "Enrich Figma with tech stack, funding, and recent news",
    "Analyze hiring trends and news at OpenAI",
  ],
  outreach: [
    "Draft a cold email to a VP Engineering about our developer platform",
    "Create a 3-email sequence for a Head of Product",
  ],
  crm_sync: [
    "Plan a CRM sync strategy for enriched accounts",
    "Design field mappings for contact enrichment data",
  ],
};
