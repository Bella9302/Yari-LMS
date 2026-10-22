-- A release rule belongs to exactly one target (a module or an item) and has the field its type needs.
ALTER TABLE "ReleaseRule" ADD CONSTRAINT "ReleaseRule_one_target"
  CHECK (("moduleId" IS NULL) <> ("itemId" IS NULL));

ALTER TABLE "ReleaseRule" ADD CONSTRAINT "ReleaseRule_type_fields" CHECK (
  ("type" = 'AFTER_DATE' AND "afterDate" IS NOT NULL) OR
  ("type" = 'ITEM_COMPLETED' AND "dependsOnItemId" IS NOT NULL) OR
  ("type" = 'MIN_SCORE' AND "dependsOnItemId" IS NOT NULL AND "minScorePct" BETWEEN 0 AND 100)
);
