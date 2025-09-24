# GEMINI.md

##  Project Context
This is a web project using **React** and **Vite** (optional TypeScript) with the following typical structure:

```
/src
  /components
  /pages
  /hooks
  /utils
vite.config.ts
package.json
```

Gemini CLI must understand that:  
- We use modern React (v18+), Vite as the bundler.  
- Highly modular code: isolated functions in `hooks`, reusable components, utilities in `utils`.  
- The typical flow is: `npm run dev` → development → `npm run build` for production.  

##  Style Rules & Workflow
- Always **plan** (PLAN mode) major changes before implementing them.  
- After planning, wait for explicit confirmation before executing (IMPLEMENT mode).  
- Use separate commits for each task, describing the intention: `git commit -m "feat: add button X"`.  
- Always write code using English

### Suggested Process (PRAR):
1. **Explain**: Diagnose or understand (`/explain ...`)  
2. **Plan**: Define strategy (`/plan ...`)  
3. **Implement**: Execute only if approved.  
4. **Refine**: Adjust based on feedback.  

##  Code Style
- Format with Prettier (2 spaces), imports ordered by group (react, libraries, local).  
- Properly type (PropTypes or TS).  
- Pure functions in `utils`, visual components only in `components`.  

##  Recommended Slash Commands
You can use these from Gemini CLI:

- `/plan "Add dark mode with Tailwind"` — will give you a preliminary strategy.  
- `/implement "..."` — executes the implementation once approved.  

##  Reminders
- Always use `/memory refresh` after editing `GEMINI.md` to reload context.  
- If there are global styles (Tailwind, CSS modules), mention them to help Gemini understand the design.
