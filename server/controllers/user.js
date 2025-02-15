const prisma = require("../config/prisma")

exports.listUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                email: true,
                role: true,
                enabled: true,
                address: true
            }
        })
        res.json(users)
    } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Server Error" })
    }
}

exports.chageStatus = async (req, res) => {
    try {
        const { id, enabled } = req.body
        console.log(id, enabled)
        const user = await prisma.user.update({
            where: { id: Number(id) },
            data: { enabled: enabled }
        })
        res.send('Update Status Successfully!')
    } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Server Error" })
    }
}

exports.chageRole = async (req, res) => {
    try {
        const { id, role } = req.body

        const user = await prisma.user.update({
            where: { id: Number(id) },
            data: { role: role }
        })
        res.send('Update Role Successfully!')
    } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Server Error" })
    }
}

exports.userCart = async (req, res) => {
    try {
        const { cart } = req.body
        console.log(cart)
        console.log(req.user.id)

        const user = await prisma.user.findFirst({
            where: { id: Number(req.user.id) }
        })
        // console.log(user)
        // Delete old Cart item
        await prisma.productOnCart.deleteMany({
            where: {
                cart: {
                    orderedById: user.id
                }
            }
        })
        // Delete old Cart
        await prisma.cart.deleteMany({
            where: {
                orderedById: user.id
            }
        })
        // เตรียมสินค้า
        let products = cart.map((item) => ({
            productId: item.id,
            count: item.count,
            price: item.price
        }))
        // หาผลรวม
        let cartTotal = products.reduce((sum, item) =>
            sum + item.price * item.count, 0)

        // New Cart
        const newCart = await prisma.cart.create({
            data: {
                products: {
                    create: products
                },
                cartTotal: cartTotal,
                orderedById: user.id
            }
        })
        console.log(cartTotal)
        res.send('Hello userCart')
    } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Server Error" })
    }
}

exports.getUserCart = async (req, res) => {
    try {
        const cart = await prisma.cart.findFirst({
            where: {
                orderedById: Number(req.user.id)
            },
            include: {
                products: {
                    include: {
                        product: true
                    }
                }
            }
        })
        // console.log(cart)
        res.json({
            products: cart.products,
            cartTotal: cart.cartTotal
        })
    } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Server Error" })
    }
}

exports.emptyCart = async (req, res) => {
    try {
        const cart = await prisma.cart.findFirst({
            where: {
                orderedById: Number(req.user.id)
            }
        })
        if (!cart) {
            return res.status(400).json({ message: "No Cart" })
        }
        // Delete productOnCart
        await prisma.productOnCart.deleteMany({
            where: {
                cartId: cart.id
            }
        })
        // Delete Cart
        const result = await prisma.cart.deleteMany({
            where: {
                orderedById: Number(req.user.id)
            }
        })
        console.log(result)
        res.json({
            message: "Cart Empty Successfully!",
            deletedCount: result.count
        })
    } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Server Error" })
    }
}

exports.saveAddress = async (req, res) => {
    try {
        const { address } = req.body
        // console.log(address)
        const addressUser = await prisma.user.update({
            where: {
                id: Number(req.user.id)
            },
            data: {
                address: address
            }
        })
        res.json({
            ok: true,
            message: "Address Updated Successfully!"
        })
    } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Server Error" })
    }
}

exports.saveOrder = async (req, res) => {
    try {
        // Step 1 Get User Cart
        const userCart = await prisma.cart.findFirst({
            where: {
                orderedById: Number(req.user.id)
            },
            include: {
                products: true
            }
        })
        // Check Cart Empty
        if (!userCart || userCart.products.length == 0) {
            return res.status(400).json({ ok: false, message: " Cart is Empty" })
        }
        // Check Quantity
        for (const item of userCart.products) {
            // console.log(item)
            const product = await prisma.product.findUnique({
                where: { id: item.productId },
                select: {
                    quantity: true,
                    title: true
                }
            })
            // console.log(item)
            // console.log(product)
            if (!product || item.count > product.quantity) {
                return res.status(400).json({ ok: false, message: `ขออภัย สินค้า : ${product?.title || 'product'} หมด` })
            }
        }

        // Create a new Order
        const order = await prisma.order.create({
            data: {
                products: {
                    create: userCart.products.map((item) => ({
                        productId: item.productId,
                        count: item.count,
                        price: item.price
                    }))
                },
                orderedBy: {
                    connect: { id: req.user.id }
                },
                cartTotal: userCart.cartTotal
            }
        })

        // Update Product
        const update = userCart.products.map((item) => ({
            where: { id: item.productId },
            data: {
                quantity: { decrement: item.count },
                sold: { increment: item.count }
            }
        }))

        await Promise.all(
            update.map((updated) => prisma.product.update(updated))
        )

        await prisma.cart.deleteMany({
            where: {
                orderedById: Number(req.user.id)
            }
        })

        res.json({ ok: true, order })
    } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Server Error" })
    }
}

exports.getOrder = async (req, res) => {
    try {
        const orders = await prisma.order.findMany({
            where: { orderedById: Number(req.user.id) },
            include: {
                products: {
                    include: {
                        product: true
                    }
                }
            }
        })
        if (!orders.length === 0) {
            return res.status(400).json({ ok: false, message: "No Order" })
        }
        // console.log(orders)
        res.json({ ok: true, orders })
    } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Server Error" })
    }
}