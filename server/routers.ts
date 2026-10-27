import {
  getSessionCookieName,
  getSessionCookieOptions,
} from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";
import { buildLegalAssistantMessages, legalAssistantInputSchema } from "./legalAssistant";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(getSessionCookieName(ctx.req), {
        ...cookieOptions,
        maxAge: -1,
      });
      return {
        success: true,
      } as const;
    }),
  }),
  legalAssistant: router({
    ask: publicProcedure.input(legalAssistantInputSchema).mutation(async ({ input }) => {
      try {
        const result = await invokeLLM({
          messages: buildLegalAssistantMessages(input),
          max_tokens: 1200,
        });
        const content = result.choices?.[0]?.message?.content;
        const answer = typeof content === "string"
          ? content.trim()
          : Array.isArray(content)
            ? content.filter((part) => part.type === "text").map((part) => part.text).join("\n").trim()
            : "";
        if (!answer) throw new Error("No completion content returned");
        return { answer };
      } catch {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "تعذر الوصول إلى المساعد حالياً. لم تُحفظ المحادثة.",
        });
      }
    }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
