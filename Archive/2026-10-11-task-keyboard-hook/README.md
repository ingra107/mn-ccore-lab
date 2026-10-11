Archived 2026-10-11 (s51 dead-weight lane). The J/K/Space/S/X/B/Z/A task shortcut hook.

Proof: its last importer, src/pages/portal/PersonalPage.tsx, was deleted in ae30dcc8 (2026-10-09, 'Slim the Hub nav'). git grep finds no import, require or dynamic-import string for it anywhere. My Tasks navigates with src/pages/MyTasks/hooks/useListKeyboard.ts (j/k, e/Enter, x/Space), imported by MyTasks/views/ListView.tsx.

The shortcuts S, B, Z and A had no other implementation, so those keys are gone (F lives on in useKeyboardShortcuts.ts). Re-attach from here if My Tasks should get them back.
