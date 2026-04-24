const fs = require('fs');
const path = require('path');

const sourcePath = path.join(process.cwd(), 'tmp_lgas_source.html');
const outputTargets = [
  path.join(process.cwd(), 'shared', 'nigeriaData.js'),
  path.join(process.cwd(), 'backend', 'src', 'data', 'nigeriaData.js'),
];
const categoryTargets = [
  path.join(process.cwd(), 'shared', 'categories.js'),
  path.join(process.cwd(), 'backend', 'src', 'data', 'categories.js'),
];
const frontendDataTarget = path.join(process.cwd(), 'frontend', 'scripts', 'data.js');

const businessCategories = [
  'Plumber',
  'Electrician',
  'Mechanic',
  'Cleaner',
  'Cook',
  'Caterer',
  'Tailor',
  'Barber',
  'Hair Stylist',
  'Makeup Artist',
  'Carpenter',
  'Painter',
  'Welder',
  'Bricklayer',
  'Tiler',
  'AC Repair',
  'Generator Repair',
  'Phone Repair',
  'Laptop Repair',
  'Photographer',
  'Videographer',
  'Event Planner',
  'DJ',
  'MC',
  'Driver',
  'Dispatch Rider',
  'Laundry Service',
  'Home Tutor',
  'Nurse',
  'Caregiver',
  'Security Guard',
  'Gardener',
  'Pest Control',
  'Interior Designer',
  'Real Estate Agent',
  'Solar Installer',
  'POS Agent',
  'Fashion Designer',
  'Shoe Maker',
  'Furniture Maker',
  'Appliance Repair',
  'Refrigerator Repair',
  'TV Repair',
  'Internet Installer',
  'Graphic Designer',
  'Web Developer',
  'Social Media Manager',
  'Accountant',
  'Lawyer',
  'Consultant',
  'Fitness Trainer',
];

function parseNigeriaData() {
  const lines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/);
  const nigeriaStatesAndLgas = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith('<tr class="lga-row"')) {
      continue;
    }

    const lgaLine = (lines[index + 2] || '').trim();
    const stateLine = (lines[index + 4] || '').trim();
    const lgaMatch = lgaLine.match(/^<td>(.*?)<\/td>$/);
    const stateMatch = stateLine.match(/>([^<]+)<\/a><\/td>$/);

    if (!lgaMatch || !stateMatch) {
      continue;
    }

    const lga = lgaMatch[1].replace(/&amp;/g, '&').trim();
    const state = stateMatch[1].replace(/&amp;/g, '&').trim();

    if (!nigeriaStatesAndLgas[state]) {
      nigeriaStatesAndLgas[state] = [];
    }

    nigeriaStatesAndLgas[state].push(lga);
  }

  return nigeriaStatesAndLgas;
}

function writeModule(targets, variableName, value, exportNames) {
  const content = `const ${variableName} = ${JSON.stringify(value, null, 2)};\n\n${exportNames
    .map((name) => {
      if (name === variableName) {
        return '';
      }
      if (name === 'nigeriaStates') {
        return 'const nigeriaStates = Object.keys(nigeriaStatesAndLgas);';
      }
      return '';
    })
    .filter(Boolean)
    .join('\n')}\n\nmodule.exports = { ${exportNames.join(', ')} };\n`;

  for (const target of targets) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

const nigeriaStatesAndLgas = parseNigeriaData();
const nigeriaStates = Object.keys(nigeriaStatesAndLgas);
const totalLgas = Object.values(nigeriaStatesAndLgas).reduce(
  (sum, current) => sum + current.length,
  0
);

if (nigeriaStates.length !== 37 || totalLgas !== 774) {
  throw new Error(`Expected 37 states/FCT and 774 LGAs, got ${nigeriaStates.length} and ${totalLgas}.`);
}

writeModule(outputTargets, 'nigeriaStatesAndLgas', nigeriaStatesAndLgas, [
  'nigeriaStatesAndLgas',
  'nigeriaStates',
]);
writeModule(categoryTargets, 'businessCategories', businessCategories, ['businessCategories']);

const frontendDataContent = `window.MaroData = ${JSON.stringify(
  {
    nigeriaStatesAndLgas,
    nigeriaStates,
    businessCategories,
  },
  null,
  2
)};\n`;
fs.mkdirSync(path.dirname(frontendDataTarget), { recursive: true });
fs.writeFileSync(frontendDataTarget, frontendDataContent);

console.log(`Generated ${nigeriaStates.length} states/FCT and ${totalLgas} LGAs.`);
