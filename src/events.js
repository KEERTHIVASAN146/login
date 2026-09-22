// Mirrors the event catalogue used by the main Phantasm site
// (backend/src/data/events.js) so entries written here line up with the
// same event_id/event_name/event_type/event_category values already in
// the shared database. Update this alongside the main site if events change.

export const EVENTS = [
  { id: "innosphere", name: "InnoSphere", category: "technical", type: "team", minSize: 1, maxSize: 4 },
  { id: "tech-trinity", name: "Tech Trinity", category: "technical", type: "solo", minSize: 1, maxSize: 1 },
  { id: "visionforge", name: "VisionForge", category: "technical", type: "solo", minSize: 1, maxSize: 1 },
  { id: "datalens", name: "DataLens", category: "technical", type: "team", minSize: 2, maxSize: 4 },
  { id: "quest-exe", name: "Quest.exe", category: "nontech", type: "team", minSize: 3, maxSize: 4 },
  { id: "zonein", name: "ZoneIn", category: "nontech", type: "team", minSize: 4, maxSize: 4 },
  { id: "bidpro", name: "BidPro", category: "nontech", type: "team", minSize: 3, maxSize: 4 },
  { id: "mindwar", name: "MindWar", category: "nontech", type: "team", minSize: 3, maxSize: 4 },
];

const eventById = new Map(EVENTS.map((e) => [e.id, e]));

export function getEvent(id) {
  return eventById.get(id);
}
