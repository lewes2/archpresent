/**
 * OPTIONAL but strongly recommended — Representative scenarios. Each step is "<diagramId>/<blockId>" and a
 * sequence may run all the way from L1 to L4; during playback it is projected onto whatever level you
 * are currently viewing — at L1 you see a few large blocks passing work back and forth, and only after
 * drilling to L4 do you see each line. Aim for 8–25 steps per flow. `from` names the source of these
 * facts (a doc path or a source file); `role` says whether this is a data flow or a control flow and
 * what to watch for.
 */
export const FLOWS = [
  {
    name:'<scenario name>',
    from:'<source of these facts>',
    role:'<data flow|control flow>: <what to watch for>',
    steps:[
      ['L1/USER',   '<what happens in this step>'],
      ['L1/CORE',   '<the next step>'],
    ],
  },
];
