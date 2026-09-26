# catalogue/use-cases/

One JSON file per use case, named after its id.

## How it works

Validated at load time (unknown requirements and cycles are rejected). The drift check compares every `api` step with the target's `GET /api` (Orqea's nested descriptor; undescribed steps are reported, not fatal). Variables available to steps: `email`, `password`, `username`, `locale`, `personaName`, `boardName`, `cardTitle`, `inviteEmail`, `strangerEmail`, `verifyUrl`/`verifyToken`, `planKey`/`planName`, and whatever earlier API steps `save` (`token`, `boardId`, `listId`, `doneListId`, `cardId`, `priorityId`, `labelId`, `formToken`…).
