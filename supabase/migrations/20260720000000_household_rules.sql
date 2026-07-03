-- ─────────────────────────────────────────────────────────────────────────────
-- Commandements du foyer : charte familiale en ton solennel-fun, reliée à la
-- gamification (chaque commandement a une priorité et des points ; un
-- manquement confessé coûte ces points via point_events ref_type='rule_breach').
-- Toute évolution (ajout, révision, retrait) est proposée par un parent et
-- validée par l'autre (workflow pending → active/rejected).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.household_rules (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id     uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  text             text        NOT NULL,
  emoji            text        NOT NULL DEFAULT '📜',
  priority         int         NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3), -- 1=sacré 2=important 3=rituel
  points           int         NOT NULL DEFAULT 10 CHECK (points > 0),              -- perdus en cas de manquement
  position         bigint      NOT NULL DEFAULT 0,
  status           text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'archived')),
  action           text        NOT NULL DEFAULT 'add' CHECK (action IN ('add', 'edit', 'remove')),
  replaces_rule_id uuid        REFERENCES public.household_rules(id) ON DELETE SET NULL,
  proposed_by      uuid        REFERENCES public.members(id) ON DELETE SET NULL,
  decided_by       uuid        REFERENCES public.members(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  decided_at       timestamptz
);

CREATE INDEX household_rules_household_idx ON public.household_rules(household_id, status);

ALTER TABLE public.household_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household_rules_select" ON public.household_rules FOR SELECT
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "household_rules_insert" ON public.household_rules FOR INSERT
  WITH CHECK (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "household_rules_update" ON public.household_rules FOR UPDATE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));
CREATE POLICY "household_rules_delete" ON public.household_rules FOR DELETE
  USING (household_id IN (SELECT household_id FROM public.members WHERE user_id = auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.household_rules;

-- ── Seed : la base décidée à deux (2026-07), reformulée en ton solennel-fun ──
-- priority 1 = sacré (15 pts), 2 = important (10 pts), 3 = rituel (5 pts).
INSERT INTO public.household_rules (household_id, position, emoji, priority, points, status, action, text) VALUES
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 10,  '📜', 3, 5,  'active', 'add', 'Matin, midi et soir, tu reliras ces commandements, afin que nul n’oublie la loi du foyer.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 20,  '💰', 1, 15, 'active', 'add', 'Tu veilleras sur les deniers du foyer comme un dragon sur son trésor.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 30,  '🍽️', 1, 15, 'active', 'add', 'Tu ne laisseras point périr la nourriture : rien ne se gaspille, tout se cuisine.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 40,  '🧽', 1, 15, 'active', 'add', 'Tu rangeras la cuisine chemin faisant : nulle pelure d’oignon ni boîte de sardines ne verra le soir sur le plan de travail.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 50,  '🛒', 2, 10, 'active', 'add', 'Tu anticiperas les courses, car le frigo vide est le père du désordre.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 60,  '📅', 2, 10, 'active', 'add', 'Tu planifieras les repas de la semaine, et la question « on mange quoi ? » sera bannie du royaume.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 70,  '🧊', 2, 10, 'active', 'add', 'Tu inspecteras frigo et congélateur, car nul ne rachète ce qu’il possède déjà.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 80,  '👕', 2, 10, 'active', 'add', 'Tu inspecteras le linge des petits comme des grands, pour que les machines partent toujours à temps.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 90,  '🌙', 2, 10, 'active', 'add', 'Tu ne dîneras point aux heures des hiboux.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 100, '🍳', 3, 5,  'active', 'add', 'Pressé, tu cuisineras simple ; paisible, tu cuisineras grand.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 110, '🧸', 2, 10, 'active', 'add', 'Les jouets des enfants seront rangés avant toute nouvelle aventure.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 120, '🕤', 2, 10, 'active', 'add', 'À 21h30 au plus tard, tu seras libéré de tout devoir, disponible pour les tiens.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 130, '📵', 1, 15, 'active', 'add', 'Ton téléphone dormira jusqu’à 9 heures : le matin appartient au foyer.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 140, '🧹', 3, 5,  'active', 'add', 'Tu fractionneras le ménage en petites conquêtes planifiées, non en bataille perdue du dimanche.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 150, '🤝', 2, 10, 'active', 'add', 'C’est ensemble que la maison sera rangée : point de héros solitaire, une armée de deux.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 160, '🛁', 2, 10, 'active', 'add', 'Le bain des enfants sera orchestré, jamais improvisé.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 170, '🔄', 2, 10, 'active', 'add', 'Un jour sur deux, chacun prendra le commandement des enfants.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 180, '🚗', 2, 10, 'active', 'add', 'Dépose et récupération des enfants se feront à tour de rôle, dans la joie et la ponctualité.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 190, '🥗', 3, 5,  'active', 'add', 'Une fois la semaine, la famille mangera léger — le corps aussi a droit à son dimanche.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 200, '🎨', 1, 15, 'active', 'add', 'Une fois la semaine, la tribu vivra une aventure commune, à la maison ou au-dehors.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 210, '🧒', 1, 15, 'active', 'add', 'Chaque parent offrira chaque jour vingt minutes pleines à chaque enfant — sans écran, sans hâte.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 220, '💞', 1, 15, 'active', 'add', 'Papa et maman se réserveront une heure par jour : parler, se poser, se retrouver.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 230, '🕊️', 1, 15, 'active', 'add', 'Tu chercheras à comprendre avant de t’énerver, car la colère est mauvaise conseillère.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 240, '🗑️', 2, 10, 'active', 'add', 'Les déchets iront aux poubelles et les poubelles iront dehors — jamais sur le plan de travail.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 250, '🍴', 2, 10, 'active', 'add', 'Si la machine a tourné le soir, le lave-vaisselle sera vidé le lendemain avant 10 heures.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 260, '🧺', 2, 10, 'active', 'add', 'Le linge lavé sera étendu dans la demi-heure, avant que le pli maudit ne s’installe.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 270, '🍲', 1, 15, 'active', 'add', 'Les enfants dîneront au plus tard à 18h30.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 280, '🚿', 1, 15, 'active', 'add', 'Les enfants seront douchés au plus tard à 19h20.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 290, '🛏️', 1, 15, 'active', 'add', 'À 20 heures, les enfants seront au lit — c’est la loi, même quand dehors il fait encore jour.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 300, '🌬️', 3, 5,  'active', 'add', 'Le linge sec quittera l’étendoir sans s’y éterniser, celui des petits comme des grands.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 310, '🗄️', 2, 10, 'active', 'add', 'Nulle pile de linge ne campera sur le lit : ce qui est plié sera rangé sur-le-champ.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 320, '🧮', 3, 5,  'active', 'add', 'Tu planifieras les machines, pour que l’étendoir ne connaisse jamais la pénurie de place.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 330, '🔕', 1, 15, 'active', 'add', 'À 21h30, les téléphones iront se coucher — les humains ont mieux à faire.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 340, '💪', 2, 10, 'active', 'add', 'Tu bougeras ton corps au moins trois fois la semaine : cardio, force et mobilité.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 350, '😴', 1, 15, 'active', 'add', 'Tu dormiras tes sept heures, car un parent reposé en vaut deux.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 360, '🏦', 2, 10, 'active', 'add', 'Tu épargneras pour chaque projet, pierre après pierre.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 370, '🧾', 2, 10, 'active', 'add', 'Avant les courses, tu consulteras le compte joint.'),
  ('d650ff09-5b09-4a57-a6b8-d725a27ce11f', 380, '📝', 2, 10, 'active', 'add', 'Tu n’iras point aux courses sans ta liste, car le rayon des tentations guette.');
