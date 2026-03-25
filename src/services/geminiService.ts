import { GoogleGenAI, Type } from "@google/genai";
import { Message, Mode, UserMemory } from "../types";
import { getMemory } from "./memoryService";

const PORTRAIT_CACHE_KEY = "vera_portrait_b64";

const MODELS = {
  chat:    "gemini-2.0-flash",
  summary: "gemini-3-flash-preview",
  image:   "imagen-3.0-generate-002",
  tts:     "gemini-2.5-flash-preview-tts",
};

const SYSTEM_INSTRUCTION_BASE = `You are Vera, an elite personal tutor with deep expertise in multiple fields. You speak in natural California American English. You are warm, direct, and highly knowledgeable. You adapt your teaching style to each person.

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

function buildSystemPrompt(mode?: Mode): string {
  const memory = getMemory();
  let base = SYSTEM_INSTRUCTION_BASE;

  if (mode === 'business') {
    base += "\n\nCONTEXT: The user wants to learn about business and entrepreneurship. Teach with real examples, ask questions to check understanding, suggest practical exercises.";
  } else if (mode === 'coding') {
    base += "\n\nCONTEXT: The user wants to learn programming. Always show code examples in code blocks. Give mini challenges after each concept. Ask what language they want to learn if not specified.";
  } else if (mode === 'logistics') {
    base += "\n\nCONTEXT: The user works in or wants to learn about logistics, supply chain, and transport. Use real industry examples. Teach Incoterms, freight types, WMS/TMS systems, KPIs. Connect everything to practical daily situations in logistics operations.";
  } else if (mode === 'portuguese') {
    base += "\n\nCONTEXT: The user wants to learn European Portuguese (Portugal). ALWAYS use European Portuguese, never Brazilian. Start by asking their current level (A1/A2/B1/B2/C1/C2) if not known from memory. Then teach according to their level. Use the complete curriculum. Correct their Portuguese writing immediately. Use visual aids (tables, flashcards) for vocabulary. Suggest resources when appropriate.";
  }

  base += "\n\nWhen you decide a visual would help, include it in your response using this format:\n[VISUAL_START]\n\n your HTML/SVG visual here \n\n[VISUAL_END]\nThen continue with your text explanation after the visual block.";

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

const getAI = () => new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "" });

export async function sendMessageToVera(messages: Message[], currentMode: Mode): Promise<string> {
  const ai = getAI();
  const history = messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  
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
    const response = await ai.models.generateContent({
      model: MODELS.chat,
      contents: [...history, { role: "user", parts: [{ text: visualPrompt }] }],
      config: { systemInstruction: buildSystemPrompt(currentMode), temperature: 0.7 },
    });
    return response.text || "Sorry, I could not process that. Try again.";
  } catch (error) {
    console.error("Chat error:", error);
    throw new Error("Vera no pudo responder. Revisa tu API key.");
  }
}

export async function searchResources(query: string): Promise<string> {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
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
  const ai = getAI();
  const history = messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  try {
    const response = await ai.models.generateContent({
      model: MODELS.summary,
      contents: [...history, { role: "user", parts: [{ text: "Summarize what we worked on today in clear bullet points. Be direct." }] }],
      config: { systemInstruction: "You are Vera. Summarize the session directly." },
    });
    return response.text || "No hay suficiente información para un resumen.";
  } catch (error) {
    throw new Error("No se pudo generar el resumen.");
  }
}

export async function generateVeraPortrait(): Promise<string | null> {
  const cached = localStorage.getItem(PORTRAIT_CACHE_KEY);
  if (cached) return cached;
  const ai = getAI();
  try {
    const response = await ai.models.generateImages({
      model: MODELS.image,
      prompt: VERA_IMAGE_PROMPT,
      config: { numberOfImages: 1, aspectRatio: "1:1" },
    });
    const b64 = response.generatedImages?.[0]?.image?.imageBytes;
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

export async function generateVeraAudio(text: string): Promise<string | null> {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: MODELS.tts,
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
      },
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) return null;
    const blob = await fetch(`data:audio/wav;base64,${base64Audio}`).then(r => r.blob());
    return URL.createObjectURL(blob);
  } catch (error) {
    return null;
  }
}

export async function extractMemoryUpdates(messages: Message[]): Promise<Partial<UserMemory> | null> {
  const ai = getAI();
  const history = messages.map((m) => `${m.role}: ${m.text}`).join("\n");
  
  const prompt = `Analyze the following conversation between Vera (tutor) and a user. 
Extract any new information about the user's weaknesses, strengths, or general notes (habits, preferences, context).
Return ONLY a JSON object with these keys: "weaknesses" (array), "strengths" (array), "notes" (array).
If nothing new is found, return empty arrays.

CONVERSATION:
${history}`;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.summary,
      contents: [{ parts: [{ text: prompt }] }],
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            notes: { type: Type.ARRAY, items: { type: Type.STRING } },
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
  const ai = getAI();
  const prompt = `You are an English writing coach. Analyze this text for grammar, spelling, and style errors. 
If there are errors, return ONLY a JSON object with: 
- hasErrors (boolean)
- corrected (the corrected text)
- explanation (brief explanation of main errors, max 2 sentences)
- errorType (a short category like 'Missing article', 'Verb tense', 'Spelling', etc.)

If the text is correct, return {hasErrors: false, corrected: text, explanation: '', errorType: ''}. 

Text to analyze: ${text}`;

  try {
    const response = await ai.models.generateContent({
      model: MODELS.chat,
      contents: [{ parts: [{ text: prompt }] }],
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hasErrors: { type: Type.BOOLEAN },
            corrected: { type: Type.STRING },
            explanation: { type: Type.STRING },
            errorType: { type: Type.STRING },
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
  const ai = getAI();
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
    const response = await ai.models.generateContent({
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

export async function generateWeeklyReport(stats: any, memory: UserMemory | null, recentMessages: Message[]): Promise<string> {
  const ai = getAI();
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
    const response = await ai.models.generateContent({
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
  const ai = getAI();
  try {
    const base64Data = imageB64.split(",")[1];
    let operation = await ai.models.generateVideos({
      model: "veo-2.0-generate-001",
      prompt: `Vera, a 28-year-old Californian woman, speaking naturally to camera. Soft lighting, neutral background. ${prompt}`,
      image: { imageBytes: base64Data, mimeType: "image/png" },
      config: { numberOfVideos: 1, resolution: "720p", aspectRatio: "1:1" },
    });
    while (!operation.done) {
      await new Promise(r => setTimeout(r, 5000));
      operation = await ai.operations.getVideosOperation({ operation });
    }
    const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) return null;
    const videoResponse = await fetch(uri, { headers: { "x-goog-api-key": import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "" } });
    return URL.createObjectURL(await videoResponse.blob());
  } catch (error) {
    return null;
  }
}
