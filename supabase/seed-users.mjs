import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://whgrkfhuzgwmbelocnhq.supabase.co';
// Use service_role key for admin operations (creating users)
const serviceRoleKey = process.env.SUPABASE_SERVICE_KEY;

if (!serviceRoleKey) {
  console.error('Set SUPABASE_SERVICE_KEY env var first.');
  console.error('Find it at: Supabase Dashboard → Settings → API Keys → service_role (secret)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const users = [
  { email: "jfeil@sandpro.com", name: "Jake Feil", initials: "JF", title: "CEO", department: "Leadership", role: "executive", reports_to: null, color: "#F97316" },
  { email: "jblackaby@sandpro.com", name: "Joshua Blackaby", initials: "JB", title: "VP Operations & Safety", department: "Operations", role: "executive", reports_to: "jfeil@sandpro.com", color: "#3B82F6" },
  { email: "mblackaby@sandpro.com", name: "Malcolm Blackaby", initials: "MB", title: "Operations Manager", department: "Operations", role: "manager", reports_to: "jblackaby@sandpro.com", color: "#8B5CF6" },
  { email: "danderson@sandpro.com", name: "Drew Anderson", initials: "DA", title: "Automation Director", department: "Automation", role: "manager", reports_to: "jfeil@sandpro.com", color: "#F97316" },
  { email: "kkraft@sandpro.com", name: "Kelby Kraft", initials: "KK", title: "Sales Manager", department: "Sales", role: "manager", reports_to: "jfeil@sandpro.com", color: "#10B981" },
  { email: "hallard-kotaska@sandpro.com", name: "Heather Allard-Kotaska", initials: "HA", title: "HR Director", department: "HR", role: "manager", reports_to: "jfeil@sandpro.com", color: "#EC4899" },
  { email: "cloving@sandpro.com", name: "Casey Loving", initials: "CL", title: "Safety Lead", department: "Safety", role: "contributor", reports_to: "jblackaby@sandpro.com", color: "#10B981" },
  { email: "tdibben@sandpro.com", name: "Tim Dibben", initials: "TD", title: "Quality Manager", department: "Quality", role: "contributor", reports_to: "mblackaby@sandpro.com", color: "#06B6D4" },
  { email: "aallan@sandpro.com", name: "Adam Allan", initials: "AA", title: "Parts & Inventory Coordinator", department: "Operations", role: "contributor", reports_to: "mblackaby@sandpro.com", color: "#F59E0B" },
  { email: "jlatz@sandpro.com", name: "John Latz", initials: "JL", title: "Sr. Automation Technician", department: "Automation", role: "contributor", reports_to: "danderson@sandpro.com", color: "#8B5CF6" },
  { email: "ibadillo@sandpro.com", name: "Isaac Badillo", initials: "IB", title: "Field Technician", department: "Field Operations", role: "contributor", reports_to: "mblackaby@sandpro.com", color: "#06B6D4" },
  { email: "zharris@sandpro.com", name: "Zedek Harris", initials: "ZH", title: "Field Technician", department: "Field Operations", role: "contributor", reports_to: "mblackaby@sandpro.com", color: "#10B981" },
  { email: "jmaslowski@sandpro.com", name: "Jaelen Maslowski", initials: "JM", title: "Shop Lead", department: "Shop", role: "contributor", reports_to: "mblackaby@sandpro.com", color: "#3B82F6" },
  { email: "bcarpenter@sandpro.com", name: "Bryan Carpenter", initials: "BC", title: "Business Development Manager", department: "Sales", role: "contributor", reports_to: "kkraft@sandpro.com", color: "#F97316" },
  { email: "slaumb@sandpro.com", name: "Serena Laumb", initials: "SL", title: "Administrative Assistant", department: "Admin", role: "contributor", reports_to: "hallard-kotaska@sandpro.com", color: "#10B981" },
  { email: "ksebastian@sandpro.com", name: "Kara Jo Sebastian", initials: "KS", title: "Controller", department: "Admin", role: "contributor", reports_to: "jfeil@sandpro.com", color: "#F59E0B" },
  { email: "mjimenez@sandpro.com", name: "Mercileidy Jimenez", initials: "MJ", title: "Executive Assistant", department: "Admin", role: "contributor", reports_to: "jfeil@sandpro.com", color: "#EC4899" },
  { email: "jleier@sandpro.com", name: "Jeremy Leier", initials: "JL", title: "Field Technician", department: "Field Operations", role: "contributor", reports_to: "mblackaby@sandpro.com", color: "#84CC16" },
  { email: "mlang@sandpro.com", name: "Michael Lang", initials: "ML", title: "Field Technician", department: "Field Operations", role: "contributor", reports_to: "mblackaby@sandpro.com", color: "#06B6D4" },
  { email: "trauschenberger@sandpro.com", name: "Tyler Rauschenberger", initials: "TR", title: "Automation Technician", department: "Automation", role: "contributor", reports_to: "danderson@sandpro.com", color: "#F97316" },
  { email: "bperson@sandpro.com", name: "Brett Person", initials: "BP", title: "Automation Technician", department: "Automation", role: "contributor", reports_to: "danderson@sandpro.com", color: "#3B82F6" },
  { email: "csweet@sandpro.com", name: "Colton Sweet", initials: "CS", title: "Field Technician", department: "Field Operations", role: "contributor", reports_to: "mblackaby@sandpro.com", color: "#10B981" },
  { email: "jdelacruz@sandpro.com", name: "Juan De La Cruz", initials: "JD", title: "Welder", department: "Shop", role: "contributor", reports_to: "jmaslowski@sandpro.com", color: "#F59E0B" },
];

const password = "BoredRoom2025!";

async function seed() {
  // First pass: create all users
  const emailToId = {};
  for (const u of users) {
    console.log(`Creating ${u.name} (${u.email})...`);
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password: password,
      email_confirm: true,
      user_metadata: {
        name: u.name,
        initials: u.initials,
        title: u.title,
        department: u.department,
        role: u.role,
        color: u.color,
      }
    });
    if (error) {
      if (error.message.includes('already been registered')) {
        console.log(`  → Already exists, fetching ID...`);
        const { data: list } = await supabase.auth.admin.listUsers();
        const existing = list.users.find(x => x.email === u.email);
        if (existing) emailToId[u.email] = existing.id;
      } else {
        console.error(`  ✗ Error: ${error.message}`);
      }
    } else {
      emailToId[u.email] = data.user.id;
      console.log(`  ✓ Created: ${data.user.id}`);
    }
  }

  // Second pass: set reports_to
  console.log('\nSetting reporting relationships...');
  for (const u of users) {
    if (u.reports_to && emailToId[u.email] && emailToId[u.reports_to]) {
      const { error } = await supabase
        .from('profiles')
        .update({ reports_to: emailToId[u.reports_to] })
        .eq('id', emailToId[u.email]);
      if (error) console.error(`  ✗ ${u.name}: ${error.message}`);
      else console.log(`  ✓ ${u.name} → reports to ${u.reports_to}`);
    }
  }

  console.log('\n✅ Done! All users created with password: ' + password);
  console.log('User IDs:', emailToId);
}

seed().catch(console.error);
