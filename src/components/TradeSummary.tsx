import { GameCard } from "@/components/GameCard";
import { toCardView } from "@/lib/cards";
import type { TradeWithItems } from "@/lib/trades";

function Items({ trade, side }: { trade: TradeWithItems; side: "OFFER" | "REQUEST" }) {
  return (
    <div className="trade-items">
      {trade.items
        .filter((i) => i.side === side)
        .map((i) => (
          <GameCard key={i.id} card={{ ...toCardView(i.card), shiny: i.shiny }} size="xs" count={i.quantity > 1 ? i.quantity : undefined} />
        ))}
    </div>
  );
}

export function TradeSummary({ trade }: { trade: TradeWithItems }) {
  return (
    <div className="trade-summary">
      <div>
        <p className="trade-who">{trade.from.name} donne</p>
        <Items trade={trade} side="OFFER" />
      </div>
      <div className="trade-arrows" aria-hidden>
        ⇄
      </div>
      <div>
        <p className="trade-who">{trade.to.name} donne</p>
        <Items trade={trade} side="REQUEST" />
      </div>
    </div>
  );
}
