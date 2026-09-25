"use client";

import { useMemo, useState } from "react";

type Variant = { id: string; name: string; price: number };
type Product = { id: string; name: string; variants: Variant[] };
type Category = { id: string; name: string; products: Product[] };
type CartItem = {
  key: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  price: number;
  quantity: number;
};

export default function CoffeeMenu({ categories }: { categories: Category[] }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map((category) => ({
        ...category,
        products: category.products.filter((product) =>
          product.name.toLowerCase().includes(q),
        ),
      }))
      .filter((category) => category.products.length > 0);
  }, [categories, search]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  function openProduct(product: Product) {
    setSelectedProduct(product);
    setSelectedVariant(product.variants[0] ?? null);
  }

  function addToCart() {
    if (!selectedProduct || !selectedVariant) return;
    const key = `${selectedProduct.id}-${selectedVariant.id}`;
    setCart((current) => {
      const existing = current.find((item) => item.key === key);
      if (existing) {
        return current.map((item) =>
          item.key === key ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...current,
        {
          key,
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          variantId: selectedVariant.id,
          variantName: selectedVariant.name,
          price: selectedVariant.price,
          quantity: 1,
        },
      ];
    });
    setSelectedProduct(null);
    setSelectedVariant(null);
  }

  function changeQuantity(key: string, amount: number) {
    setCart((current) =>
      current
        .map((item) =>
          item.key === key ? { ...item, quantity: item.quantity + amount } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  return (
    <main className="page">
      <header>
        <b>Kiri</b>
        <small>coffee and food</small>
      </header>

      <section className="hero">
        <p>Good morning ☀️</p>
        <h1>Enjoy your favorite coffee<br />and fresh food today.</h1>
        <input
          className="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="⌕  Search menu..."
          aria-label="Search menu"
        />
      </section>

      <div className="promo">
        <div>
          <p>Start Your Day</p>
          <h2>With Great<br />Coffee</h2>
          <span>Explore Menu →</span>
        </div>
        <div className="cup">☕</div>
      </div>

      <h2 className="title">Our Menu</h2>

      {filteredCategories.map((category) => (
        <section key={category.id}>
          <h3>{category.name}</h3>
          {category.products.map((product) => (
            <article className="card" key={product.id}>
              <div className="img">☕</div>
              <div>
                <strong>{product.name}</strong>
                <p>
                  {product.variants
                    .map((variant) => `${variant.name} $${variant.price.toFixed(2)}`)
                    .join(" • ")}
                </p>
              </div>
              <button onClick={() => openProduct(product)} aria-label={`Add ${product.name}`}>
                +
              </button>
            </article>
          ))}
        </section>
      ))}

      <nav>
        <span>⌂ Home</span>
        <span>☕ Menu</span>
        <button className="cart-nav" onClick={() => setCartOpen(true)}>
          ▣ Orders {cartCount > 0 && <b>{cartCount}</b>}
        </button>
        <span>♙ Profile</span>
      </nav>

      {selectedProduct && (
        <div className="overlay" onClick={() => setSelectedProduct(null)}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <button className="close" onClick={() => setSelectedProduct(null)}>×</button>
            <div className="big-img">☕</div>
            <h2>{selectedProduct.name}</h2>
            <p className="muted">Choose a size</p>
            <div className="variant-list">
              {selectedProduct.variants.map((variant) => (
                <button
                  key={variant.id}
                  className={selectedVariant?.id === variant.id ? "variant selected" : "variant"}
                  onClick={() => setSelectedVariant(variant)}
                >
                  <span>{variant.name}</span>
                  <b>${variant.price.toFixed(2)}</b>
                </button>
              ))}
            </div>
            <button className="primary" onClick={addToCart} disabled={!selectedVariant}>
              Add to Cart {selectedVariant ? `• $${selectedVariant.price.toFixed(2)}` : ""}
            </button>
          </div>
        </div>
      )}

      {cartOpen && (
        <div className="overlay" onClick={() => setCartOpen(false)}>
          <div className="sheet cart-sheet" onClick={(event) => event.stopPropagation()}>
            <button className="close" onClick={() => setCartOpen(false)}>×</button>
            <h2>Your Cart</h2>
            {cart.length === 0 ? (
              <p className="empty">Your cart is empty.</p>
            ) : (
              <>
                <div className="cart-list">
                  {cart.map((item) => (
                    <div className="cart-row" key={item.key}>
                      <div>
                        <strong>{item.productName}</strong>
                        <small>{item.variantName} • ${item.price.toFixed(2)}</small>
                      </div>
                      <div className="qty">
                        <button onClick={() => changeQuantity(item.key, -1)}>−</button>
                        <b>{item.quantity}</b>
                        <button onClick={() => changeQuantity(item.key, 1)}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="cart-total">
                  <span>Total</span>
                  <strong>${cartTotal.toFixed(2)}</strong>
                </div>
                <button className="primary" onClick={() => alert("Checkout will be connected next.")}>Checkout</button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
