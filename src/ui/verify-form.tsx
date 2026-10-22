import { Button } from "@/ui/button";
import { Input } from "@/ui/field";

/** Plain GET form: works without JavaScript, and from a code typed off a printed certificate. */
export function VerifyForm({ defaultValue }: { defaultValue?: string }) {
  return (
    <form action="/verify" method="get" className="flex flex-col gap-3 sm:flex-row" role="search">
      <label htmlFor="verify-code" className="sr-only">
        Certificate code
      </label>
      <Input
        id="verify-code"
        name="code"
        required
        placeholder="YG-XXXX-XXXX"
        defaultValue={defaultValue}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        className="font-mono tracking-wider uppercase sm:max-w-xs"
      />
      <Button type="submit">Check certificate</Button>
    </form>
  );
}
