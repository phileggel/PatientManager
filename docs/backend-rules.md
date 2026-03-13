# Backend Rules

**AI AGENT SHOULD NEVER UPDATE THIS DOCUMENT**

## Domain object

- MUST be created with a factory method 
  - new() => will validate fields and generate id (use in service)
  - with_id() => will validate fields (use in api/service)
  - restore() => direct restore from database, no validation (use in repository)

## Bounded Context (/context)

- MUST never import from another context

- MUST share its external api directly through its main mod.rs.
  - outside of the context never import crate::context::patient::domain::Patient, always crate::context::patient::Patient
  
- SHOULD always publish a {Domain}Updated event when its state change ( create, update, delete, etc.).

- MUST its tauri::command in the api.rs file

## UseCases (/use_cases)

- MAY import from another context

- SHOULD NEVER import from another use_case

- MUST share its external api directly through its main mod.rs.

- DONT publish a {Domain}Updated event (orchestrator that don't own its state.)

- MUST declare its tauri::command in the api.rs file

- SHOULD have an orchestrator as its main entry point (after api) that handle the global logic.

## Repository

- MUST use sqlx macro in the repository. Use `just clean-db` to reset the database if needed.

## General rules

- MUST use anyhow::Result<T> for error handling
  - exception: tauri command response

- MAY use #[allow(clippy::too_many_arguments)] on domain factory method*
  
## Test
Définition d'un test trivial (backend)

  Un test trivial est un test qui vérifie :
  - qu'un constructeur ne panique pas
  - qu'une entrée vide donne une sortie vide (aucune logique traversée)
  - qu'un getter retourne ce qu'on vient de passer
  - une fixture de test (helper déguisé en test)

