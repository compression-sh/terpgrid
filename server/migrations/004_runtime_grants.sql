-- Laufzeitrolle darf den Schemastand lesen (Start-Prüfung der API auf passende Version)
GRANT SELECT ON schema_migrations TO terpgrid_app;
