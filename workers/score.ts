import * as xml from 'fast-xml-parser';

export function buildTransposedXML(musicXML: string, semitones: number): string {
  // very simplified: shift <pitch><alter> / <step> / <octave> as needed
  // In practice, parse fully and apply diatonic + chromatic rules.
  const j = xml.XMLParser ? new xml.XMLParser({ ignoreAttributes: false }) : null;
  if (!j) return musicXML;
  const doc = j.parse(musicXML);
  // Walk notes
  const notes = findAllNotes(doc);
  for (const n of notes) transposeNote(n, semitones);
  const b = new xml.XMLBuilder({ ignoreAttributes: false });
  return b.build(doc);
}

function findAllNotes(doc: any): any[] {
  const out: any[] = [];
  const parts = doc['score-partwise']?.part || [];
  for (const p of Array.isArray(parts) ? parts : [parts]) {
    const measures = p.measure || [];
    for (const m of Array.isArray(measures) ? measures : [measures]) {
      const ns = m.note || [];
      for (const n of Array.isArray(ns) ? ns : [ns]) {
        if (n.pitch) out.push(n);
      }
    }
  }
  return out;
}

const STEP_TO_INT: Record<string, number> = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
const INT_TO_STEP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function transposeNote(n: any, semis: number) {
  const step = n.pitch.step;
  const alter = parseInt(n.pitch.alter ?? 0);
  const octave = parseInt(n.pitch.octave);

  let midi = (octave + 1) * 12 + STEP_TO_INT[step] + alter;
  midi += semis;
  const newOct = Math.floor(midi / 12) - 1;
  const pc = midi % 12;
  const name = INT_TO_STEP[pc];
  const [newStep, sharp] = name.includes('#') ? [name[0], 1] : [name, 0];

  n.pitch.step = newStep;
  n.pitch.alter = sharp;
  n.pitch.octave = newOct;
}
