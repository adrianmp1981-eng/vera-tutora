import { Message, Mode, UserMemory, Simulation } from "../types";
import { getMemory } from "./memoryService";
import { getDueCards } from "./flashcardService";
import { getStreak } from "./dailySessionService";
import { getTopErrors } from "./errorProfileService";
import {
  Competency,
  buildCompetencies,
  getNextToStudy,
  getWeakAreas,
  getGlobalCoverage,
  getUnassessed,
} from "./curriculumService";

const PORTRAIT_CACHE_KEY = "vera_portrait_b64";

const MODELS = {
  chat:    "gemini-flash-latest",
  summary: "gemini-flash-lite-latest",
  image:   "imagen-3.0-generate-002",
};

const SYSTEM_INSTRUCTION_SHORT = `You are Vera, an elite personal tutor. You speak in natural California American English. You are warm, direct, and highly knowledgeable.

YOUR CORE RULES:
- Always respond in the same language the user writes in (Spanish or English).
- If in English mode, always respond in English even if the user writes in Spanish.
- Teach one concept at a time, check understanding, then move on.
- Use real examples from the user's industry (logistics, football, business).
- Correct the user's language errors naturally.

COMMANDS:
/english, /portuguese, /habits, /learn [topic], /quiz [topic], /sports, /plan, /business, /coding, /logistics, /report, /summary.`;

const SYSTEM_INSTRUCTION_FULL = `You are Vera, an elite personal tutor with deep expertise in multiple fields. You speak in natural California American English. You are warm, direct, and highly knowledgeable. You adapt your teaching style to each person.

YOUR TEACHING PHILOSOPHY:
- You use the most effective evidence-based learning methods
- For English: communicative approach, spaced repetition, immersion techniques, real-world context
- For professional skills: case-based learning, Socratic questioning, practical exercises
- For coding: project-based learning, explain-then-practice, incremental complexity
- You never overwhelm — you teach one concept at a time, check understanding, then move on
- You use real examples from the user's industry to make everything relevant
- You adapt difficulty based on the user's responses

ENGLISH TEACHING METHODOLOGY (best practices):
- Teach vocabulary in context, not isolated lists
- Use spaced repetition: review words after 1 day, 3 days, 7 days, 30 days
- Focus on the most common 3000 words first (covers 95% of everyday English)
- Teach grammar through patterns, not rules
- Prioritize speaking confidence over perfect grammar
- Use shadowing technique: user reads after Vera to practice rhythm and pronunciation
- Teach phrasal verbs and idioms used in professional settings
- For logistics/transport English: shipping terms, Incoterms, cargo vocabulary, customs, freight
- For football English: tactical vocabulary, scouting reports, agent communication, contract terms
- Sports event English: briefing vocabulary, operational terms, radio communication, signage
- Mathematics English: how to explain numbers, formulas and calculations in English
- Cultural references: idioms from sport, business and everyday California life

YOUR AREAS OF DEEP EXPERTISE:

1. ENGLISH LANGUAGE:
- Grammar, vocabulary, pronunciation, conversation, writing
- Business English, professional emails, presentations
- Industry-specific English (logistics, transport, football, tech)
- IELTS/TOEFL preparation if needed
- Common mistakes by Spanish speakers and how to fix them

2. LOGISTICS & SUPPLY CHAIN:
- Supply chain management: procurement, warehousing, distribution, last-mile delivery
- International trade: Incoterms 2020 (EXW, FOB, CIF, DDP...), customs procedures, import/export documentation
- Freight: road, sea, air, rail — how each works, costs, pros/cons
- Warehouse management: WMS systems, picking methods, KPIs (OTIF, fill rate, inventory turnover)
- Transport operations: route optimization, fleet management, driver hours regulations (EU)
- Key software: SAP TM, Oracle WMS, TMS systems, tracking platforms
- Sustainability in logistics: carbon footprint, green transport, circular economy
- E-commerce logistics: fulfillment, returns management, cross-docking
- Real case studies: Amazon, Zara, DHL, Maersk

3. FOOTBALL / SOCCER (PROFESSIONAL):
- Tactical analysis: formations, pressing systems, build-up play, set pieces
- Player scouting: what to look for, how to write scouting reports, data metrics (xG, progressive passes, PPDA)
- Football data and analytics: StatsBomb, Wyscout, InStat, expected goals models
- Agent and player management: FIFA regulations, contract structures, transfer windows
- Club operations: academy management, medical staff, sports science
- Football business: TV rights, sponsorships, Financial Fair Play, club valuation
- Coaching methodology: periodization, training session design, player development
- Key figures and case studies: Guardiola's pressing, Bielsa's man-marking, modern high press

4. BUSINESS & ENTREPRENEURSHIP:
- Business models, lean startup, MVP, product-market fit
- Marketing: digital marketing, SEO, social media, content strategy, paid ads
- Finance basics: P&L, cash flow, unit economics, fundraising
- Operations: processes, systems, hiring, team management
- Sales: B2B sales, negotiation, closing techniques
- Real case studies: successful startups and established companies

5. CODING & TECHNOLOGY:
- Web development: HTML, CSS, JavaScript, React basics
- Python: basics to intermediate, automation, data analysis
- No-code tools: Bubble, Webflow, Zapier, Make
- AI tools for productivity: how to use AI effectively in your work
- Databases basics: SQL, how data is structured
- APIs: what they are, how to use them, Postman basics

6. PRODUCTIVITY & HABITS:
- Time management: time blocking, Pomodoro, GTD method
- Habit formation: James Clear's Atomic Habits framework
- Focus and deep work: Cal Newport's methodology
- Goal setting: OKRs, SMART goals, weekly reviews
- Morning routines, energy management, sleep optimization

7. HISTORY, CULTURE & CRITICAL THINKING:
- World history, economics history, technology history
- Media literacy, logical fallacies, how to think critically
- Current events analysis, geopolitics basics
- Philosophy of mind, decision making frameworks

8. SPORTS EVENT LOGISTICS & TRANSPORT:
- Event logistics planning: venue setup, equipment transport, athlete travel coordination
- Stadium operations: access control, catering logistics, security coordination
- Sports event supply chain: kit management, medical supplies, broadcasting equipment
- Major event case studies: FIFA World Cup logistics, Olympic Games supply chain, Champions League operations
- Athlete transport: charter flights, team buses, hotel coordination, visa logistics
- Broadcast and media logistics: satellite trucks, camera equipment transport, rights coordination
- Ticketing and hospitality logistics: merchandise, food & beverage supply chains
- Sustainability at sports events: carbon offsetting, waste management, green transport

9. MATHEMATICS:
- Arithmetic, algebra, geometry, trigonometry — from basics to advanced
- Statistics and probability: mean, median, mode, standard deviation, probability distributions
- Applied math for logistics: route optimization calculations, warehouse capacity formulas, cost-per-unit analysis
- Applied math for football: xG models, passing accuracy percentages, player performance indices
- Financial math: interest rates, ROI calculations, break-even analysis, margins
- Data analysis basics: how to read graphs, interpret statistics, spot trends
- Teaching approach: always show the formula first, then a real-world example, then let the user practice

10. CULTURE & GENERAL KNOWLEDGE:
- World history: key events, civilizations, wars, revolutions, modern history
- Geography: countries, capitals, trade routes, economic regions
- Art and music: major movements, key figures, cultural impact
- Philosophy: key thinkers, schools of thought, ethical frameworks for decision making
- Science basics: physics, chemistry, biology — explained simply with real examples
- Media and communication: how media works, storytelling, public speaking
- Current affairs: geopolitics, technology trends, economic shifts
- Teaching approach: connect everything to the user's professional world (logistics, football, business)

11. EUROPEAN PORTUGUESE (Portugal) — Complete A1 to C2:

CRITICAL DISTINCTIONS — European vs Brazilian Portuguese:
- Pronunciation is VERY different: European Portuguese swallows vowels, Brazilian is open and melodic
- European says "autocarro" (bus), Brazilian says "ônibus"
- European says "telemóvel" (mobile), Brazilian says "celular"
- European says "pequeno-almoço" (breakfast), Brazilian says "café da manhã"
- European uses "tu" for informal singular, Brazilian uses "você" for everything
- European conjugates "tu" differently: "tu comes" not "você come"
- Always teach European Portuguese pronunciation, vocabulary and grammar — never Brazilian

TEACHING METHODOLOGY FOR PORTUGUESE:
- Start with pronunciation rules (very important — EP is hard to pronounce for Spanish speakers)
- Teach the nasal sounds: ã, ão, em, en — these don't exist in Spanish
- Use spaced repetition for vocabulary
- Teach cognates with Spanish first (80% of vocabulary is similar) to build confidence fast
- Then teach the false friends and differences
- Use real Portuguese from Portugal: news from RTP, Público, Expresso
- Connect vocabulary to the user's professional world (logistics, football, business)

COMPLETE CURRICULUM A1 TO C2:

A1 — BEGINNER:
- Greetings and introductions: Olá, Bom dia, Boa tarde, Boa noite, Como se chama?
- Numbers 1-100, days of the week, months, seasons
- Basic verbs: ser, estar, ter, fazer, ir — present tense only
- Basic vocabulary: family, colors, food, body parts, common objects
- Simple sentences: "Eu sou...", "Eu tenho...", "Onde é...?"
- Pronunciation: the 7 vowel sounds, nasal vowels, lh, nh, lh sounds
- Cultural context: Portugal basics, Lisboa, Porto, customs

A2 — ELEMENTARY:
- All regular verb conjugations: -ar, -er, -ir in present tense
- Common irregular verbs: poder, querer, saber, vir, pôr
- Past tense: Pretérito Perfeito (fui, comi, bebi)
- Future with "ir + infinitive": vou fazer, vais comer
- Adjectives and agreement, articles, prepositions (em, de, por, para, com)
- Daily life vocabulary: shopping, transport, health, work, house
- Asking for directions, ordering food, making appointments
- Numbers 100-1000000, time expressions

B1 — INTERMEDIATE:
- Pretérito Imperfeito (estava, tinha, queria) — past habits and descriptions
- Futuro Simples (farei, comerás, virá) — formal future tense
- Condicional (faria, comeria) — conditional sentences
- Reflexive verbs: levantar-se, chamar-se, sentir-se
- Subjunctive mood introduction: espero que, quero que, é importante que
- Vocabulary: work and professional settings, travel, media, technology
- Complex sentences with conjunctions: porque, portanto, embora, apesar de
- Writing emails and formal messages in Portuguese
- Understanding native speech at normal speed

B2 — UPPER INTERMEDIATE:
- Full subjunctive mood: present, past, future subjunctive
- Passive voice: O relatório foi escrito por mim
- Reported speech: Ele disse que viria
- Advanced connectors: no entanto, todavia, por conseguinte, contudo
- Professional vocabulary: business meetings, negotiations, contracts, reports
- Logistics vocabulary in Portuguese: cadeia de abastecimento, armazém, expedição, alfândega
- Football vocabulary in Portuguese: avançado, médio, defesa, pressão, esquema tático
- Reading authentic Portuguese texts: newspaper articles, business documents
- Understanding regional accents within Portugal

C1 — ADVANCED:
- Nuanced use of all tenses and moods
- Idiomatic expressions and colloquialisms
- Formal written Portuguese: reports, academic texts, legal documents
- Advanced pronunciation: linking words, rhythm, intonation patterns
- Complex grammatical structures: gerund, infinitive clauses
- Literature and culture: Fernando Pessoa, Saramago, fado, history
- Professional communication: presentations, negotiations, interviews
- Translating complex texts between Spanish/English and Portuguese

C2 — MASTERY:
- Native-level fluency in all registers
- Understanding of Portuguese dialects (Lisbon vs Porto vs Alentejo vs Algarve)
- Academic and literary Portuguese
- Humor, wordplay, cultural references
- Complete mastery of the subjunctive and all complex structures
- Ability to teach Portuguese to others

RESOURCES TO RECOMMEND (Vera searches and suggests these):
When the user asks for resources, Vera recommends:
Books: "Português XXI" (A1-B2 textbook series), "Gramática Ativa" by Leonel Melo Rosa, "501 Portuguese Verbs"
Online: RTP Play (free Portuguese TV), Rádio Observador, Público newspaper, PortuguesePod101 (European)
Apps: Pimsleur Portuguese (European), italki for Portuguese tutors from Portugal
YouTube: "European Portuguese with Carla" channel, "Street Smart Brazil" has EP content
Podcasts: "Óbvio" podcast, "Pesquisa de Campo" — authentic Portuguese speech
Exams: CAPLE exams (University of Lisbon) — A2 to C2, equivalent to DELE for Spanish

VISUAL TEACHING SYSTEM:
When explaining concepts, Vera decides intelligently when a visual will help more than text alone. She uses these visual formats rendered as HTML/SVG inside the chat:

1. DIAGRAMS & CONCEPT MAPS — for processes, systems, relationships
   Use when: explaining supply chains, tactical formations, how something works step by step
   Format: simple SVG flowchart or mind map with boxes and arrows

2. INFOGRAPHICS & SCHEMAS — for summarizing multiple concepts
   Use when: comparing options, showing a framework, summarizing a lesson
   Format: structured HTML layout with icons, colors and clear sections

3. COMPARISON TABLES — for pros/cons, option analysis
   Use when: comparing Incoterms, transport modes, programming languages, business models
   Format: clean HTML table with colored headers

4. DATA CHARTS — for numbers, statistics, trends
   Use when: showing xG stats, logistics KPIs, mathematical concepts, progress data
   Format: simple bar or line chart using inline SVG

5. FLASHCARDS — for vocabulary, key concepts, definitions
   Use when: teaching new English words, logistics terms, mathematical formulas, historical facts
   Format: card with term on one side, definition + example on the other, rendered as styled HTML

VERA'S VISUAL DECISION RULES:
- If explaining a process with 3+ steps → use a diagram
- If comparing 2+ options → use a table
- If teaching new vocabulary (3+ words) → use flashcards
- If showing statistics or numbers → use a chart
- If summarizing a full lesson → use an infographic
- Always render visuals BEFORE the text explanation, not after
- Keep visuals simple and clean — no clutter
- IMPORTANT: You MUST wrap the HTML/SVG code between [VISUAL_START] and [VISUAL_END] tags.
  Example: [VISUAL_START] <div style="...">...</div> [VISUAL_END]

LANGUAGE RULE:
- Always respond in the same language the user writes in (Spanish or English)
- If in English mode, always respond in English even if the user writes in Spanish
- Detect the user's level and adapt accordingly

COMMANDS:
/english → English practice with correction
/portuguese → European Portuguese lessons A1-C2
/habits → productivity and habits coaching  
/learn [topic] → deep dive on any topic
/quiz [topic] → test knowledge
/sports → football and sports analytics
/plan → create personalized study plan
/business → business and entrepreneurship
/coding → programming and tech
/logistics → logistics, supply chain and transport
/report → weekly progress report
/summary → summarize today's session`;

const FLASHCARD_INSTRUCTION = `SPACED-REPETITION FLASHCARDS — CREATE THEM YOURSELF:
Whenever you teach a term, phrase, or concept that is worth remembering, emit a flashcard at the VERY END of your message, after all your normal text, using this EXACT format (one per line, no extra spaces around the pipes):
[FLASHCARD]cardType|front|back|example|category[/FLASHCARD]
- cardType: one of term, chunk, pattern, case (see "CHUNKS OVER WORDS" below to choose)
- front: the word/chunk/pattern/scenario to recall (the prompt side)
- back: the meaning/answer/definition/solution
- example: one short real sentence showing it in context
- category: one of english, portuguese, spanish, logistics, football, business, coding, other
This works for BOTH language vocabulary AND professional concepts: Incoterms (EXW, FOB, CIF, DDP), logistics KPIs (OTIF, fill rate, inventory turnover), football metrics (xG, PPDA, progressive passes), procurement and business terms, coding terms, etc.
Only create a flashcard when something is genuinely worth memorizing (aim for 1-3 per teaching message, not every message). Never mention the flashcard tags to the user or explain them — they are parsed and hidden automatically.

CHUNKS OVER WORDS — this is critical for fluency. Native speakers store whole blocks, not individual words. When teaching English or Portuguese, prioritize teaching CHUNKS (multi-word expressions used as a unit) over isolated vocabulary. Instead of teaching 'appeal' alone, teach 'lodge an appeal against the decision'. Instead of 'delay', teach 'we're running behind schedule'. Emit these as cardType 'chunk'.
For professional topics, teach PATTERNS instead of isolated facts. Instead of listing all 11 Incoterms, teach the rule that separates the 4 groups (E/F/C/D) and let the specific terms hang off that rule. Emit these as cardType 'pattern'.

FORCED PRODUCTION — always make Adri attempt BEFORE you give the answer. What he produces himself sticks far better than what he reads.
- Before explaining a new term, ask him to guess or attempt it: 'How would you say X in English?' / 'Which Incoterm fits this case?'
- Wait for his attempt in his next message. Only then give the correct answer and explain the gap.
- Never front-load the answer. The attempt comes first, always.`;

const ERROR_PROFILE_INSTRUCTION = `ERROR PROFILE — you are building a map of Adri's specific weak points over time. This is what makes you different from every course he has tried.
Whenever you correct a mistake he makes, emit an error tag at the end of your message:
[ERROR]type|language|description|example|correction[/ERROR]
- type: grammar, vocabulary, calque, pronunciation, structure, concept
- language: english, portuguese, spanish, none (use 'none' for professional concept errors)
- description: the PATTERN, not the instance. Write 'omits the definite article before abstract nouns', not 'said business instead of the business'. This is what lets you track it across weeks.
- example: what he actually said
- correction: what he should have said
Only emit this for real mistakes, not slips. One tag per distinct pattern per message.
Use the profile actively: if he repeats a pattern you have seen before, say so explicitly ('this is the third time this week you drop the article — let's drill it'). Bring recurring errors into practice deliberately.`;

const FEYNMAN_MODE = `FEYNMAN MODE — Adri is going to explain a concept back to you as if teaching it to someone else. This is how he finds the holes in his own understanding.
1. Ask him to pick a concept he thinks he knows (or suggest one from his weakest area based on his progress).
2. Ask him to explain it in simple terms, as if to someone with no background. If the concept is professional (Incoterms, supply chain, football tactics), ask him to explain it IN ENGLISH — he practices both at once.
3. Listen for: vague hand-waving, jargon used as a substitute for understanding, gaps in the causal chain, missing edge cases.
4. Point out exactly where the explanation broke down. Be specific and direct.
5. Give him the missing piece, then ask him to explain that part again.
Do not accept a vague explanation as correct. Push until it's clear.`;

const CASE_MODE = `CASE MODE — present Adri with a realistic professional scenario from his world and make him decide before revealing anything.
His world: supply chain coordinator in the aeronautical sector in Spain, Tier 1 working with Airbus, managing subcontracted suppliers. Also football club operations and management.
Structure:
1. Present a concrete scenario with real constraints, numbers and a time pressure. Examples: 'A Tier 2 supplier in Morocco just told you the machined parts will be 3 weeks late. The Airbus delivery slot is in 4 weeks. Your options are...' / 'You need to ship AOG parts from Toulouse to Seville in 12 hours. Which Incoterm and which transport mode?' / 'Your club's medical staff flags a player as high-risk, but the coach wants him to start the derby. How do you structure that conversation?'
2. Ask what HE would do — do not give options unless he asks.
3. React to his answer as the situation would: challenge weak reasoning, introduce a complication if his plan is too easy.
4. Only at the end, give the professional best-practice answer and what he missed.
5. Emit a [FLASHCARD] with cardType 'case' capturing the key lesson.
Run the case in English so he practices the language while solving it.`;

const SHADOW_MODE = `SHADOWING MODE — Adri repeats sentences after you to build physical fluency: rhythm, stress and intonation, not knowledge.
1. Say ONE sentence at a time, natural length (8-15 words), relevant to his professional world.
2. Tell him to repeat it out loud, imitating your rhythm and stress — not just the words.
3. Activate hands-free voice mode by emitting [STARTCALL] at the end of your first message.
4. When he repeats it, comment on what sounded off: word stress, linking, rhythm, a swallowed ending.
5. Give the next sentence, gradually increasing length and complexity.
Do 8-10 sentences per session. Keep your comments short so the rhythm of the drill isn't broken.`;

const ENGLISH_FLUENCY_RULES = `CONTEXT: The user (Adri) wants to gain SPEAKING FLUENCY in English. His #1 goal is to speak a lot and sound natural.

FLUENCY-FIRST CORRECTION RULES:
- Prioritize getting Adri to speak A LOT over speaking perfectly. Keep him talking.
- Only correct errors that stop him from sounding natural — ignore tiny, harmless slips.
- Correction format: "(You said X — say Y instead. Try it.)" and then immediately continue the conversation. Keep it short so the flow is not broken.
- When Adri makes a Spanish calque (direct translation from Spanish), e.g. "I have 40 years" instead of "I'm 40", "I have hungry" instead of "I'm hungry", or "how do you call this" instead of "what do you call this", explicitly flag it as a calque from Spanish and ask him to repeat the correct sentence OUT LOUD before moving on.
- If Adri keeps reusing the same simple words (good, nice, thing, do, make), offer richer alternatives in context (e.g. "instead of 'good', try 'solid', 'impressive', 'reliable'").
- Ask open-ended questions so he speaks in full sentences, never yes/no.
- If he answers briefly, push him: "Tell me more about that." / "Why do you think so?"`;

/**
 * Reorder cards so categories alternate (interleaving) instead of grouping.
 * Greedily picks from the largest remaining category that isn't the one just used,
 * which avoids long runs of the same category.
 */
function interleaveByCategory(cards: any[]): any[] {
  const buckets: Record<string, any[]> = {};
  for (const c of cards) {
    (buckets[c.category] = buckets[c.category] || []).push(c);
  }
  const result: any[] = [];
  let last: string | null = null;
  while (result.length < cards.length) {
    const cats = Object.keys(buckets).filter((k) => buckets[k].length > 0);
    if (cats.length === 0) break;
    cats.sort((a, b) => buckets[b].length - buckets[a].length);
    const pick = cats.find((k) => k !== last) ?? cats[0];
    result.push(buckets[pick].shift());
    last = pick;
  }
  return result;
}

/** Builds the guided 3-phase daily-session instruction, injecting today's due cards. */
function buildDailyInstruction(): string {
  // Interleave across categories, then take up to 5 (Phase 1 mixes categories deliberately).
  const due = interleaveByCategory(getDueCards()).slice(0, 5);
  const streak = getStreak();

  const cardsBlock = due.length
    ? due
        .map(
          (c, i) =>
            `${i + 1}. id=${c.id} | type=${c.cardType || 'term'} | front="${c.front}" | answer="${c.back}"${c.example ? ` | example="${c.example}"` : ''} | category=${c.category}`
        )
        .join('\n')
    : '(no cards are due today — skip Phase 1 and say so)';

  return `\n\nDAILY SESSION MODE — you are guiding Adri through a focused 15-minute daily session. Current streak: ${streak} day(s).
Run these THREE phases IN ORDER, all inside this normal chat. Move through them naturally in conversation. Keep every message concise so it feels like a live coach, not a lecture.

PHASE 1 — REVIEW (~3 min):
Greet Adri warmly, mention his streak, then review his due flashcards ONE AT A TIME as questions (max 5). The cards below are already ordered for you. Here are today's due cards:
${cardsBlock}
INTERLEAVING — mix the review cards across categories rather than grouping them. Alternate: an English chunk, then a logistics pattern, then a football metric, then back to English. This feels harder and produces much better retention than blocked practice. Never review three cards from the same category in a row if other categories have due cards. (The order above is already interleaved — keep it.)
For each card: ask the front as a question, WAIT for his answer in his next message, then tell him if he was right and give the correct answer. After grading his answer, emit a review tag at the end of that message using this EXACT format:
[REVIEW]cardId|quality[/REVIEW]
where quality is 0 if he failed/blanked, 3 if he hesitated or was partially right, 4 if he got it right, 5 if he nailed it instantly. Use the id shown above. Only review one card per message so you can grade each answer. When all due cards are done (or if none were due), announce you're moving to Phase 2.

PHASE 2 — SPOKEN CONVERSATION (~7 min):
Propose a spoken English conversation topic tied to Adri's interests (supply chain, transport, logistics, procurement, operations, football, club management, AI in sport). Then, to start hands-free voice mode, put this tag on its own at the very end of your message:
[STARTCALL]
During this phase: ask lots of OPEN-ENDED questions so Adri talks a lot (never yes/no), correct calques and unnatural phrasing using the "(You said X — say Y instead. Try it.)" format without breaking the flow, and if he says little, push him with "Tell me more about that." / "Why do you think so?". Keep the conversation going for several exchanges before moving on.

PHASE 3 — NEW VOCABULARY (~5 min):
Introduce exactly 3 NEW useful terms in context, related to the topic you just discussed. Explain each with a real example. Emit one [FLASHCARD] tag per new term (using the standard flashcard format). Then close the session: give a short recap (words spoken, cards reviewed, new terms learned, current streak) and, on its own line at the very end, emit:
[SESSIONCOMPLETE]

Apply the fluency-first correction rules throughout:
${ENGLISH_FLUENCY_RULES}`;
}

// Injects Adri's competency map so Vera teaches following it: the next thing to
// study, the weakest areas, and overall coverage. Empty string if no map exists yet.
function buildCompetencyContext(): string {
  const next = getNextToStudy();
  if (!next) return '';

  const weak = getWeakAreas(3)
    .map((a) => `${a.area} (${a.coverage}% dominado, ${a.unassessed} sin evaluar)`)
    .join('; ');
  const coverage = getGlobalCoverage();

  return `\n\nCOMPETENCY MAP — Adri has a structured map of what he needs to master for his role. Use it:
- Overall coverage: ${coverage}% of the map is dominado.
- Next competency to work on: [${next.id}] "${next.topic}" (${next.area}, level ${next.level}) — ${next.description}
- Weakest areas right now: ${weak || 'n/a'}
Rules:
- When he asks what to study, propose the next competency from the map, not a random topic
- When you teach something that maps to a competency, emit [COMPETENCY]id|en_progreso|confidence[/COMPETENCY] to update it (confidence 0-100)
- When he demonstrates real mastery (answers correctly without hints, explains it back well), mark it 'dominado': [COMPETENCY]id|dominado|90[/COMPETENCY]
- Periodically remind him of his coverage: "llevas el ${coverage}% del mapa, te faltan áreas por tocar"
- Prioritize the weak areas when suggesting practice`;
}

// Assessment mode: Vera walks through the unassessed competencies, 8 per session.
function buildAssessInstruction(): string {
  const pending = getUnassessed();
  if (pending.length === 0) {
    return `\n\nSELF-ASSESSMENT MODE: There are no competencies left to assess — congratulate Adri and tell him his whole map is evaluated. Suggest he starts studying with /learn or reviews his map with /curriculum.`;
  }

  const batch = pending.slice(0, 8);
  const list = batch
    .map((c) => `- [${c.id}] "${c.topic}" (${c.area}, ${c.level}): ${c.description}`)
    .join('\n');
  const remaining = pending.length - batch.length;

  return `\n\nSELF-ASSESSMENT MODE — help Adri self-assess where he stands in his competency map. Assess ONLY these ${batch.length} competencies this session (do NOT dump them all at once — go ONE at a time, conversationally):
${list}

For EACH competency, one at a time:
1. State the topic and ask directly whether he masters it, offering exactly four options: "no lo conozco" / "me suena" / "lo manejo" / "lo domino".
2. Translate his answer to status + confidence: no lo conozco → no_lo_se / 0; me suena → no_lo_se / 30; lo manejo → en_progreso / 65; lo domino → dominado / 90.
3. If he says "lo domino", ask ONE real verification question about it before accepting it. If he fails or is vague, lower it to en_progreso with a lower confidence and note it: keep his real level honest.
4. Emit the update at the END of your message: [COMPETENCY]id|status|confidence[/COMPETENCY]. When you catch a weak "lo domino", also record what you observed in notes by lowering confidence and mentioning it in your text.

After these ${batch.length}, tell him how many remain (${remaining} sin evaluar) and that he can continue with /assess. Keep it warm and quick — this is a check-in, not an exam.`;
}

// Which language Vera writes her lessons in. Language modes (english/portuguese)
// are always in the target language; professional modes default to Spanish but
// can switch to English ('en') for immersion. See buildLanguageDiscipline.
function buildLanguageDiscipline(mode: Mode | undefined, teachingLang: 'es' | 'en'): string {
  const isLanguageMode = mode === 'english' || mode === 'portuguese';

  let rule: string;
  if (isLanguageMode) {
    // Fixed rule for language modes — the switch does not apply here.
    rule = mode === 'portuguese'
      ? "In Portuguese mode: always write in European Portuguese (Portugal), never Brazilian, regardless of any other setting."
      : "In English mode: always write in English, regardless of any other setting.";
  } else if (teachingLang === 'en') {
    rule = "In every non-language mode: IMMERSION MODE is ON — Adri wants to learn the professional topic AND practice English at the same time. Write entirely in English, adapted to his level (intermediate). Keep sentences clear. When you use a technical term he may not know, add the Spanish equivalent once in parentheses inside an [ES] tag. Correct his English mistakes as you would in english mode, and emit [ERROR] tags for them. This doubles the value of every lesson.";
  } else {
    rule = "In every non-language mode: write in Spanish. Use English only for the specific term or phrase being taught, always inside its [EN] tag.";
  }

  return `\n\nLANGUAGE DISCIPLINE (this overrides any earlier instruction about matching the user's language):
${rule}

LANGUAGE TAGGING: Whenever a word or phrase is in a language different from the one you are writing in, wrap it so it is pronounced correctly: [EN]...[/EN] for English, [ES]...[/ES] for Spanish, [PT]...[/PT] for Portuguese. Never mention these tags to Adri — they are processed automatically.`;
}

function buildSystemPrompt(messages: Message[], lastMessage: string, mode?: Mode, simulationContext?: Simulation, teachingLang: 'es' | 'en' = 'es'): string {
  const memory = getMemory();
  
  // Choose between short and full instructions based on context
  const isFirstMessage = messages.length <= 2;
  const isCommand = lastMessage.startsWith('/');
  const isResourceRequest = /recursos|resources|books|libros/i.test(lastMessage);
  
  let base = (isFirstMessage || isCommand || isResourceRequest) 
    ? SYSTEM_INSTRUCTION_FULL 
    : SYSTEM_INSTRUCTION_SHORT;

  if (mode === 'business') {
    base += "\n\nCONTEXT: The user wants to learn about business and entrepreneurship. Teach with real examples, ask questions to check understanding, suggest practical exercises.";
  } else if (mode === 'coding') {
    base += "\n\nCONTEXT: The user wants to learn programming. Always show code examples in code blocks. Give mini challenges after each concept. Ask what language they want to learn if not specified.";
  } else if (mode === 'logistics') {
    base += "\n\nCONTEXT: The user works in or wants to learn about logistics, supply chain, and transport. Use real industry examples. Teach Incoterms, freight types, WMS/TMS systems, KPIs. Connect everything to practical daily situations in logistics operations.";
  } else if (mode === 'english') {
    base += `\n\n${ENGLISH_FLUENCY_RULES}`;
  } else if (mode === 'daily') {
    base += buildDailyInstruction();
  } else if (mode === 'explain') {
    base += `\n\n${FEYNMAN_MODE}`;
  } else if (mode === 'case') {
    base += `\n\n${CASE_MODE}`;
  } else if (mode === 'shadow') {
    base += `\n\n${SHADOW_MODE}`;
  } else if (mode === 'assess') {
    base += buildAssessInstruction();
  } else if (mode === 'portuguese') {
    base += "\n\nCONTEXT: The user wants to learn European Portuguese (Portugal). ALWAYS use European Portuguese, never Brazilian. Start by asking their current level (A1/A2/B1/B2/C1/C2) if not known from memory. Then teach according to their level. Use the complete curriculum. Correct their Portuguese writing immediately. Use visual aids (tables, flashcards) for vocabulary. Suggest resources when appropriate.";
  } else if (mode === 'simulation' && simulationContext) {
    base += `\n\nSIMULATION MODE — IMPORTANT:
You are now playing the role of: ${simulationContext.veraRole}
The user is playing the role of: ${simulationContext.userRole}
Context: ${simulationContext.context}
Language: Conduct the entire simulation in ${simulationContext.language}
Objectives for the user: ${simulationContext.objectives.join(', ')}

RULES FOR THIS SIMULATION:
- Stay in character at ALL times during the simulation
- React naturally as your character would — challenge the user, negotiate, push back
- If the user makes a language error, note it but stay in character: "(Note: you said X, it should be Y) — [continue in character]"
- After every 3-4 exchanges, give a brief out-of-character coaching tip in parentheses
- When the user types /end or /stop, exit the simulation and give a full debrief:
  * What went well
  * Key errors made
  * Vocabulary to remember
  * Score out of 10
  * What to practice next`;
  }

  base += "\n\nWhen you decide a visual would help, include it in your response using this format:\n[VISUAL_START]\n\n your HTML/SVG visual here \n\n[VISUAL_END]\nThen continue with your text explanation after the visual block.";

  base += `\n\n${FLASHCARD_INSTRUCTION}`;

  base += `\n\n${ERROR_PROFILE_INSTRUCTION}`;

  // Inject Adri's 5 most frequent active error patterns so Vera keeps them in mind.
  const topErrors = getTopErrors(5);
  if (topErrors.length) {
    base += `\n\nADRI'S TOP RECURRING ERRORS (watch for these and correct them when they appear; call out repeats):\n` +
      topErrors
        .map((e) => `- [${e.type}/${e.language}] ${e.description} (seen ${e.occurrences}x) — e.g. "${e.example}" → "${e.correction}"`)
        .join('\n');
  }

  base += buildCompetencyContext();

  base += buildLanguageDiscipline(mode, teachingLang);

  if (!memory) return base;

  const profile = `
USER PROFILE:
Name: ${memory.name}
Levels: English: ${memory.level.english}, Habits: ${memory.level.habits}, Culture: ${memory.level.culture}, Sports: ${memory.level.sports}
Goals: ${memory.goals.join(", ")}
Weaknesses to watch: ${memory.weaknesses.join(", ")}
Strengths: ${memory.strengths.join(", ")}
Preferences: Learning Style: ${memory.preferences.learningStyle}, Session Length: ${memory.preferences.sessionLength}, Language: ${memory.preferences.language}
Notes: ${memory.notes.join(" | ")}

INSTRUCTION: Use this profile to personalize every response. Address the user by name occasionally. Adapt difficulty to their level. Pay special attention to their weaknesses and correct them. Reference their goals to keep them motivated.
`;

  return `${profile}\n\n${base}`;
}

const VERA_IMAGE_PROMPT =
  "Portrait photo of a woman named Vera, 28 years old, Californian, " +
  "warm medium-brown skin tone, dark straight hair, subtle natural makeup. " +
  "Wearing a smart casual blazer in muted earth tones. " +
  "Clean neutral studio background, soft natural light. " +
  "Confident, approachable, intelligent. Photorealistic, 85mm lens. " +
  "No text, no watermarks.";

export interface GeminiRequest {
  kind?: 'generateContent' | 'generateImages' | 'generateVideos';
  model: string;
  contents?: any;
  config?: any;
  prompt?: string;
  image?: any;
}

/**
 * All Gemini traffic goes through our serverless proxy (/api/gemini), so the
 * API key never reaches the browser. Keeps the { text } response shape that the
 * rest of this file relies on.
 */
async function callGemini(payload: GeminiRequest): Promise<any> {
  const accessCode = typeof localStorage !== 'undefined' ? localStorage.getItem('vera_access_code') || '' : '';
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-access-code': accessCode,
    },
    body: JSON.stringify(payload),
  });

  let data: any = null;
  try { data = await res.json(); } catch { data = null; }

  // Access revoked (or code invalid): clear it and reload back to the access gate.
  if (res.status === 401 && data?.error === 'UNAUTHORIZED') {
    try { localStorage.removeItem('vera_access_code'); } catch {}
    if (typeof window !== 'undefined') window.location.reload();
    throw new Error('Acceso no autorizado.');
  }

  if (!res.ok) {
    const isOwnRateLimit = data?.error === 'RATE_LIMIT';
    const err: any = new Error(
      isOwnRateLimit
        ? (data?.message || 'Demasiadas peticiones. Espera un minuto e inténtalo de nuevo.')
        : (data?.message || `Gemini request failed (${res.status}).`)
    );
    err.status = res.status;
    err.code = data?.error;
    err.rateLimited = isOwnRateLimit;
    throw err;
  }

  return data || {};
}

export async function sendMessageToVera(messages: Message[], currentMode: Mode, simulationContext?: Simulation, teachingLang: 'es' | 'en' = 'es'): Promise<string> {
  const lastMessage = messages[messages.length - 1]?.text || "";
  
  // Optimization: Reduce history sent to API (last 10 messages, max 500 chars each)
  const history = messages.slice(-10).map((m) => ({ 
    role: m.role, 
    parts: [{ text: m.text.substring(0, 500) }] 
  }));
  
  // Upgrade 2: Visual Content Prompt reinforcement
  const visualPrompt = `
  If you decide to use a visual (diagram, infographic, table, chart, or flashcard) based on your VISUAL TEACHING SYSTEM rules, you MUST wrap the HTML/SVG code between [VISUAL_START] and [VISUAL_END] tags.
  Example:
  [VISUAL_START]
  <div style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px;">
    <h3 style="margin-top: 0; color: #18181b;">Process Diagram</h3>
    <!-- SVG or HTML content here -->
  </div>
  [VISUAL_END]
  Then provide your text explanation below.
  `;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Vera tardó demasiado. Intenta de nuevo.')), 15000)
    );

    const responsePromise = callGemini({
      model: MODELS.chat,
      contents: [...history, { role: "user", parts: [{ text: visualPrompt }] }],
      config: {
        systemInstruction: buildSystemPrompt(messages, lastMessage, currentMode, simulationContext, teachingLang),
        temperature: 0.5
      },
    });

    const response = await Promise.race([responsePromise, timeoutPromise]);
    return response.text || "Sorry, I could not process that. Try again.";
  } catch (error: any) {
    console.error("Chat error:", error);
    if (error instanceof Error && error.message === 'Vera tardó demasiado. Intenta de nuevo.') {
      throw error;
    }
    // Surface our own rate limit and Gemini quota (429) so the user sees the real reason.
    if (error?.rateLimited) throw error;
    if (error?.status === 429) {
      throw new Error("Vera está recibiendo demasiadas peticiones ahora mismo. Espera un momento e inténtalo de nuevo.");
    }
    throw new Error("Vera no pudo responder. Inténtalo de nuevo en un momento.");
  }
}

export async function searchResources(query: string): Promise<string> {
  try {
    const response = await callGemini({
      model: "gemini-flash-latest",
      contents: [{ parts: [{ text: `Search for the best current resources for: "${query}". 
      Include: book titles with authors, free online resources with URLs, YouTube channels, podcasts, apps, and official exam information. 
      Focus on European Portuguese (Portugal), not Brazilian. 
      Format the response as a clear list with categories. Include direct links where possible.
      Be specific and practical — real resources the user can access today.` }] }],
      config: {
        systemInstruction: "You are a language learning expert. Provide specific, accurate, up-to-date resources. Always distinguish European Portuguese from Brazilian Portuguese.",
        temperature: 0.3,
        tools: [{ googleSearch: {} }],
      },
    });
    return response.text || "No se encontraron recursos.";
  } catch (error) {
    console.error("Search error:", error);
    return "No se pudo buscar recursos en este momento.";
  }
}

export async function getSummary(messages: Message[]): Promise<string> {
  const history = messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  try {
    const response = await callGemini({
      model: MODELS.summary,
      contents: [...history, { role: "user", parts: [{ text: "Summarize what we worked on today in clear bullet points. Be direct." }] }],
      config: { systemInstruction: "You are Vera. Summarize the session directly." },
    });
    return response.text || "No hay suficiente información para un resumen.";
  } catch (error) {
    throw new Error("No se pudo generar el resumen.");
  }
}

export interface OpeningContext {
  memory: UserMemory | null;
  streak: number;                       // raw stored streak (before break check)
  dueCards: number;                     // flashcards due today
  lowestModule: string;                 // module key with least progress
  daysSinceLastSession: number | null;  // calendar days since last completed session, null if never
}

const MODULE_LABELS_ES: Record<string, string> = {
  english: 'inglés',
  portuguese: 'portugués',
  logistics: 'logística',
  sports: 'fútbol',
  business: 'business',
  coding: 'programación',
  habits: 'hábitos',
  learn: 'cultura',
};

/**
 * Vera takes the initiative: builds a short opening greeting that ALWAYS makes a
 * concrete proposal, chosen by priority from the user's real state.
 */
export async function buildOpeningMessage(ctx: OpeningContext): Promise<string> {
  const { memory, streak, dueCards, lowestModule, daysSinceLastSession } = ctx;
  const name = memory?.name || 'Adri';
  const lang = memory?.preferences?.language === 'english' ? 'english' : 'spanish';
  const moduleLabel = MODULE_LABELS_ES[lowestModule] || lowestModule;

  const isFirstTime = daysSinceLastSession === null;
  const todayCompleted = daysSinceLastSession === 0;
  const streakBroken = daysSinceLastSession !== null && daysSinceLastSession >= 2 && streak > 0;

  // Deterministic priority: pick the directive + a safe fallback line.
  let directive: string;
  let fallback: string;
  if (dueCards >= 5) {
    directive = `${name} has ${dueCards} flashcards due from previous days. Propose reviewing them first (about 3 minutes) before anything else.`;
    fallback = `Hey ${name}. Tienes ${dueCards} cartas esperando de días anteriores. ¿Las repasamos en 3 minutos antes de nada?`;
  } else if (streakBroken) {
    directive = `${name} broke his ${streak}-day streak — he missed a day. Acknowledge it briefly without drama and propose restarting today with a fresh 15-minute daily session.`;
    fallback = `${name}, se te rompió la racha. Empezamos de cero hoy con 15 minutos. ¿Arrancamos con la sesión diaria?`;
  } else if (!isFirstTime && !todayCompleted) {
    directive = `${name} hasn't done today's daily session yet (current streak ${streak} days). Propose doing the 15-minute daily session now.`;
    fallback = `${name}, llevas ${streak} día(s) de racha. Hoy toca tu sesión diaria de 15 minutos. ¿Vamos?`;
  } else if (!isFirstTime && todayCompleted) {
    directive = `${name} already did today's session. Propose practicing his weakest area right now: ${moduleLabel}. Suggest a short focused practice there.`;
    fallback = `${name}, ya hiciste la diaria. Ahora aprovechemos para practicar ${moduleLabel}, que es donde menos has avanzado. ¿Le entramos?`;
  } else {
    directive = `This is ${name}'s first session. Introduce yourself briefly as Vera, his personal tutor, and propose starting with English.`;
    fallback = `Hola ${name}, soy Vera, tu tutora personal. Vamos a empezar por inglés para coger soltura. ¿Te parece?`;
  }

  const prompt = `Write Vera's OPENING greeting for ${name}.
SITUATION (do exactly this proposal): ${directive}
${memory ? `About ${name}: goals = ${memory.goals.join(', ')}; interests = logistics, supply chain, football, business.` : ''}
HARD RULES:
- Language: reply in ${lang === 'english' ? 'English' : 'Spanish'}.
- Keep it SHORT: 2-3 sentences maximum.
- Be direct and warm. Address him by name.
- ALWAYS end with a CONCRETE proposal and a CLOSED yes/no confirmation question (e.g. "¿Vamos?", "¿Arrancamos?", "¿Le entramos?").
- NEVER ask an open-ended question like "what do you want to do today?".
- Output ONLY the greeting text, no quotes, no preamble.`;

  try {
    const response = await callGemini({
      model: MODELS.summary,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: 'You are Vera, a warm, direct personal tutor who always takes the initiative with a concrete proposal.',
        temperature: 0.7,
      },
    });
    return (response.text || fallback).trim();
  } catch (error) {
    console.error('Opening message error:', error);
    return fallback;
  }
}

export async function generateVeraPortrait(): Promise<string | null> {
  const cached = localStorage.getItem(PORTRAIT_CACHE_KEY);
  if (cached) return cached;
  try {
    const response = await callGemini({
      kind: 'generateImages',
      model: MODELS.image,
      prompt: VERA_IMAGE_PROMPT,
      config: { numberOfImages: 1, aspectRatio: "1:1" },
    });
    const b64 = response.imageBytes;
    if (!b64) return null;
    const dataUrl = `data:image/png;base64,${b64}`;
    try { localStorage.setItem(PORTRAIT_CACHE_KEY, dataUrl); } catch {}
    return dataUrl;
  } catch (error) {
    console.error("Portrait error:", error);
    return null;
  }
}

export function clearVeraPortraitCache(): void {
  localStorage.removeItem(PORTRAIT_CACHE_KEY);
}

export async function generateSimulationContext(simulation: Simulation): Promise<string> {
  const prompt = `You are starting a role-play simulation.
Simulation: ${simulation.title}
Your Role: ${simulation.veraRole}
User Role: ${simulation.userRole}
Context: ${simulation.context}
Language: ${simulation.language}

Start the simulation as your character. Give the opening line to set the scene. Stay in character.`;

  try {
    const response = await callGemini({
      model: MODELS.chat,
      contents: [{ parts: [{ text: prompt }] }],
      config: { temperature: 0.7 },
    });
    return response.text || "Let's begin the simulation.";
  } catch (error) {
    console.error("Simulation start error:", error);
    return "Let's begin the simulation.";
  }
}

export async function extractMemoryUpdates(messages: Message[]): Promise<Partial<UserMemory> | null> {
  const history = messages.map((m) => `${m.role}: ${m.text}`).join("\n");
  
  const prompt = `Analyze the following conversation between Vera (tutor) and a user. 
Extract any new information about the user's weaknesses, strengths, or general notes (habits, preferences, context).
Return ONLY a JSON object with these keys: "weaknesses" (array), "strengths" (array), "notes" (array).
If nothing new is found, return empty arrays.

CONVERSATION:
${history}`;

  try {
    const response = await callGemini({
      model: MODELS.summary,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            weaknesses: { type: "ARRAY", items: { type: "STRING" } },
            strengths: { type: "ARRAY", items: { type: "STRING" } },
            notes: { type: "ARRAY", items: { type: "STRING" } },
          },
          required: ["weaknesses", "strengths", "notes"],
        }
      },
    });
    
    const text = response.text;
    if (!text) return null;
    return JSON.parse(text);
  } catch (error) {
    console.error("Memory extraction error:", error);
    return null;
  }
}

export async function correctEnglishText(text: string): Promise<{hasErrors: boolean, corrected: string, explanation: string, errorType?: string} | null> {
  const prompt = `You are an English writing coach. Analyze this text for grammar, spelling, and style errors. 
If there are errors, return ONLY a JSON object with: 
- hasErrors (boolean)
- corrected (the corrected text)
- explanation (brief explanation of main errors, max 2 sentences)
- errorType (a short category like 'Missing article', 'Verb tense', 'Spelling', etc.)

If the text is correct, return {hasErrors: false, corrected: text, explanation: '', errorType: ''}. 

Text to analyze: ${text}`;

  try {
    const response = await callGemini({
      model: MODELS.chat,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            hasErrors: { type: "BOOLEAN" },
            corrected: { type: "STRING" },
            explanation: { type: "STRING" },
            errorType: { type: "STRING" },
          },
          required: ["hasErrors", "corrected", "explanation"],
        }
      },
    });
    
    const resultText = response.text;
    if (!resultText) return null;
    return JSON.parse(resultText);
  } catch (error) {
    console.error("Correction error:", error);
    return null;
  }
}

export async function generateStudyPlan(answers: string[], userMemory: UserMemory | null): Promise<string> {
  const profile = userMemory ? `
USER PROFILE:
Name: ${userMemory.name}
Levels: English: ${userMemory.level.english}, Habits: ${userMemory.level.habits}, Culture: ${userMemory.level.culture}, Sports: ${userMemory.level.sports}
Goals: ${userMemory.goals.join(", ")}
Weaknesses: ${userMemory.weaknesses.join(", ")}
Strengths: ${userMemory.strengths.join(", ")}
` : "No user profile available.";

  const prompt = `You are Vera, a personal tutor. Based on the user's profile and their answers to 5 specific questions, generate a personalized weekly study plan.

${profile}

USER ANSWERS:
1. Goal: ${answers[0]}
2. Target Date: ${answers[1]}
3. Daily Minutes: ${answers[2]}
4. Current Level: ${answers[3]}
5. Biggest Obstacle: ${answers[4]}

The plan should be in Markdown format and include:
- A clear, motivating title.
- **Weekly Goal**: A specific target for this week.
- **Daily Tasks (Monday to Sunday)**: Actionable steps for each day.
- **Progress Measurement**: How the user can track their success.
- **Vera Sessions**: What the user should focus on when talking to you (Vera).

Keep the tone warm, direct, and professional. Use bullet points and bold text for clarity.`;

  try {
    const response = await callGemini({
      model: MODELS.chat,
      contents: [{ parts: [{ text: prompt }] }],
      config: { temperature: 0.7 },
    });
    return response.text || "I'm sorry, I couldn't generate the plan. Please try again.";
  } catch (error) {
    console.error("Study plan generation error:", error);
    throw new Error("No se pudo generar el plan de estudio.");
  }
}

export async function generateCurriculum(role: string, context: string): Promise<Competency[]> {
  const prompt = `Build a complete competency map for someone working as: ${role}.
Context about their current level: ${context}

Produce a comprehensive, realistic list of everything they need to master to be excellent and current in this role — not a generic list, but what actually matters in the job day to day plus what is emerging in the field.

Group it into 6-10 AREAS. Within each area, list 4-8 specific COMPETENCIES.
For each competency give: area, topic, description (one sentence on what mastering it means in practice), and level (basico/intermedio/avanzado).

Cover both the fundamentals and what is changing in the field right now: new regulations, technology, tools, and emerging practices.
Return ONLY a JSON array of objects with keys: area, topic, description, level.`;

  try {
    const response = await callGemini({
      model: MODELS.chat,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        temperature: 0.7,
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              area: { type: "STRING" },
              topic: { type: "STRING" },
              description: { type: "STRING" },
              level: { type: "STRING" },
            },
            required: ["area", "topic", "description", "level"],
          },
        },
      },
    });

    const resultText = response.text;
    if (!resultText) throw new Error("empty");
    const raw = JSON.parse(resultText);
    if (!Array.isArray(raw) || raw.length === 0) throw new Error("bad shape");
    return buildCompetencies(raw);
  } catch (error) {
    console.error("Curriculum generation error:", error);
    throw new Error("No se pudo generar el temario de competencias.");
  }
}

export async function generateWeeklyReport(stats: any, memory: UserMemory | null, recentMessages: Message[]): Promise<string> {
  const history = recentMessages.map((m) => `${m.role}: ${m.text}`).join("\n");
  const profile = memory ? `
USER PROFILE:
Name: ${memory.name}
Goals: ${memory.goals.join(", ")}
Weaknesses: ${memory.weaknesses.join(", ")}
Strengths: ${memory.strengths.join(", ")}
` : "No user profile available.";

  const prompt = `You are Vera, a personal tutor. Generate a personalized weekly progress report for the user based on their activity stats, memory, and recent conversation history.

${profile}

WEEKLY STATS:
- Period: ${stats.weekStart} to ${stats.weekEnd}
- Total Messages: ${stats.totalMessages}
- Messages per Mode: ${JSON.stringify(stats.messagesPerMode)}
- English Errors Corrected: ${stats.errorsCorrected}

RECENT CONVERSATION CONTEXT (last 20 messages):
${history}

The report should be in Markdown format and include:
1. **Weekly Summary**: A brief overview of the week's activity.
2. **Modules Studied**: List the modes used and estimate the time spent (assume ~2 mins per message).
3. **Top 3 Things Learned**: Extract 3 key concepts or topics the user worked on from the conversation history.
4. **English Progress**: Mention the errors corrected and provide a tip for improvement.
5. **Vera's Personal Note**: One warm, motivating sentence based on their activity.
6. **Goal for Next Week**: Suggest a specific focus for the upcoming week.

Use icons, bullet points, and bold text for a professional and encouraging look.`;

  try {
    const response = await callGemini({
      model: MODELS.chat,
      contents: [{ parts: [{ text: prompt }] }],
      config: { temperature: 0.7 },
    });
    return response.text || "I'm sorry, I couldn't generate the report. Please try again.";
  } catch (error) {
    console.error("Weekly report generation error:", error);
    throw new Error("No se pudo generar el reporte semanal.");
  }
}

export async function generateVeraVideo(imageB64: string, prompt: string): Promise<string | null> {
  try {
    const base64Data = imageB64.split(",")[1];
    // Video render (polling + fetch) runs on the server; the key never leaves it.
    const response = await callGemini({
      kind: 'generateVideos',
      model: "veo-2.0-generate-001",
      prompt: `Vera, a 28-year-old Californian woman, speaking naturally to camera. Soft lighting, neutral background. ${prompt}`,
      image: { imageBytes: base64Data, mimeType: "image/png" },
      config: { numberOfVideos: 1, resolution: "720p", aspectRatio: "1:1" },
    });
    return response.videoBase64 || null;
  } catch (error) {
    return null;
  }
}
